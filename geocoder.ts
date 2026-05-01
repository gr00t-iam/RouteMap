// Geocoder layer.
//
// US addresses go to the U.S. Census Geocoder (free, no key, batch API up to
// 10,000 records). Anything outside the US falls back to OpenStreetMap's
// Nominatim service (free, rate-limited to 1 req/sec on the public instance).
//
// Census endpoints:
//   1. Single-line address (synchronous, JSON):
//      GET /geocoder/locations/onelineaddress?address=...&benchmark=Public_AR_Current&format=json
//   2. Bulk batch (async, multipart upload of CSV, returns CSV):
//      POST /geocoder/locations/addressbatch  (limit 10,000 records per request)
//
// Nominatim endpoint:
//   GET https://nominatim.openstreetmap.org/search?q=<address>&format=json&limit=1
//   Usage policy: max 1 req/sec, must set User-Agent (browsers do this automatically).
//   For production, self-host Nominatim or use Photon/MapTiler to avoid the rate cap.
//
// Docs:
//   - Census: https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.pdf
//   - Nominatim: https://nominatim.org/release-docs/develop/api/Search/

import type { Address } from '@/types';

const BASE = import.meta.env.VITE_CENSUS_GEOCODER_URL ?? 'https://geocoding.geo.census.gov/geocoder';
const NOMINATIM = import.meta.env.VITE_NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org';
const BENCHMARK = 'Public_AR_Current';

// If the Nominatim host is the public openstreetmap.org one, throttle to 1.1
// sec/request. For self-hosted instances we trust the operator and skip the
// throttle.
const NOMINATIM_NEEDS_THROTTLE = NOMINATIM.includes('openstreetmap.org');

interface CensusMatch {
  matchedAddress: string;
  coordinates: { x: number; y: number }; // x = lng, y = lat
  tigerLine?: { tigerLineId: string; side: string };
  addressComponents?: Record<string, string>;
}

interface OneLineResponse {
  result: {
    input: { address: { address: string }; benchmark: { id: string; benchmarkName: string } };
    addressMatches: CensusMatch[];
  };
}

/**
 * Geocode a single address. Returns the best match or null.
 * Throws on network / HTTP errors so the caller can surface them.
 */
export async function geocodeOne(fullAddress: string): Promise<{ lat: number; lng: number; matched: string } | null> {
  const url = new URL(`${BASE}/locations/onelineaddress`);
  url.searchParams.set('address', fullAddress);
  url.searchParams.set('benchmark', BENCHMARK);
  url.searchParams.set('format', 'json');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Census geocoder HTTP ${res.status}`);
  const data = (await res.json()) as OneLineResponse;
  const match = data.result.addressMatches?.[0];
  if (!match) return null;
  return { lat: match.coordinates.y, lng: match.coordinates.x, matched: match.matchedAddress };
}

/**
 * Bulk-geocode a list of Address records.
 *
 * Routing:
 *   - US addresses (country === "US"): Census batch endpoint (10k chunks).
 *   - Non-US addresses: Nominatim, one at a time, with ~1.1 sec spacing to
 *     respect the public-server fair-use policy. For >100 international
 *     stops, expect a noticeable wait (and consider self-hosting Nominatim).
 *
 * The function reports progress via the optional onProgress callback.
 */
export async function geocodeBatch(
  addresses: Address[],
  onProgress?: (done: number, total: number) => void
): Promise<Address[]> {
  const updated: Address[] = addresses.map((a) => ({ ...a }));
  const usIdx: number[] = [];
  const intlIdx: number[] = [];
  updated.forEach((a, i) => (a.country === 'US' ? usIdx.push(i) : intlIdx.push(i)));

  let done = 0;
  const total = updated.length;

  // ---- US: Census batch ----
  const CHUNK_SIZE = 10000;
  for (let i = 0; i < usIdx.length; i += CHUNK_SIZE) {
    const chunkIdx = usIdx.slice(i, i + CHUNK_SIZE);
    const csv = chunkIdx
      .map((j) => {
        const a = updated[j];
        return [a.id, csvEscape(a.street), csvEscape(a.city), csvEscape(a.state), csvEscape(a.zip)].join(',');
      })
      .join('\n');

    const form = new FormData();
    form.append('addressFile', new Blob([csv], { type: 'text/csv' }), 'addresses.csv');
    form.append('benchmark', BENCHMARK);

    const res = await fetch(`${BASE}/locations/addressbatch`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`Census batch HTTP ${res.status}`);
    const text = await res.text();

    const rows = text.split(/\r?\n/).filter(Boolean);
    for (const row of rows) {
      const cols = parseCsvRow(row);
      const id = cols[0];
      const matchKind = cols[2];
      const matched = cols[4];
      const coords = cols[5];
      const target = updated.find((a) => a.id === id);
      if (!target) continue;
      if (matchKind === 'Match' && coords) {
        const [lngStr, latStr] = coords.split(',');
        target.lat = Number(latStr);
        target.lng = Number(lngStr);
        target.geocodeStatus = 'matched';
        target.geocodeSource = 'census';
        target.geocodeMessage = matched;
      } else {
        // Census missed it — try Nominatim as a second pass (it sometimes catches edge cases).
        const fallback = await geocodeNominatim(target.fullAddress);
        if (fallback) {
          target.lat = fallback.lat;
          target.lng = fallback.lng;
          target.geocodeStatus = 'matched';
          target.geocodeSource = 'nominatim';
          target.geocodeMessage = fallback.matched + ' (Census missed; Nominatim fallback)';
          if (NOMINATIM_NEEDS_THROTTLE) await sleep(1100);
        } else {
          target.geocodeStatus = 'unmatched';
          target.geocodeMessage = matchKind || 'No match';
        }
      }
    }

    done += chunkIdx.length;
    onProgress?.(done, total);
  }

  // ---- International: Nominatim, throttled ----
  for (const idx of intlIdx) {
    const a = updated[idx];
    try {
      const result = await geocodeNominatim(a.fullAddress);
      if (result) {
        a.lat = result.lat;
        a.lng = result.lng;
        a.geocodeStatus = 'matched';
        a.geocodeSource = 'nominatim';
        a.geocodeMessage = result.matched;
      } else {
        a.geocodeStatus = 'unmatched';
        a.geocodeMessage = 'Nominatim: no match';
      }
    } catch (err) {
      a.geocodeStatus = 'failed';
      a.geocodeMessage = (err as Error).message;
    }
    done++;
    onProgress?.(done, total);
    if (NOMINATIM_NEEDS_THROTTLE) await sleep(1100); // Respect public Nominatim's 1 req/sec policy.
  }

  return updated;
}

/** Nominatim single-address lookup. Returns null if no match. */
export async function geocodeNominatim(query: string): Promise<{ lat: number; lng: number; matched: string } | null> {
  const url = new URL(`${NOMINATIM}/search`);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '0');
  const res = await fetch(url.toString(), { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (data.length === 0) return null;
  return { lat: Number(data[0].lat), lng: Number(data[0].lon), matched: data[0].display_name };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function csvEscape(v: unknown): string {
  if (v === undefined || v === null) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Minimal CSV row parser handling quoted fields.
function parseCsvRow(row: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (inQuotes) {
      if (c === '"' && row[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}
