// Geocoder – browser-safe version.
//
// The Census batch POST endpoint blocks cross-origin browser requests (CORS).
// This version uses the single-line GET endpoint for every address instead,
// which the Census API allows from the browser. Nominatim is used as a fallback
// for any address Census can't match, and as the primary for non-US addresses.
//
// Census single-line: GET /geocoder/locations/onelineaddress?address=...
// Nominatim:          GET https://nominatim.openstreetmap.org/search?q=...

import type { Address } from '@/types';

const BASE      = import.meta.env.VITE_CENSUS_GEOCODER_URL ?? 'https://geocoding.geo.census.gov/geocoder';
const NOMINATIM = import.meta.env.VITE_NOMINATIM_URL       ?? 'https://nominatim.openstreetmap.org';
const BENCHMARK = 'Public_AR_Current';

const NOMINATIM_NEEDS_THROTTLE = NOMINATIM.includes('openstreetmap.org');

interface CensusMatch {
  matchedAddress: string;
  coordinates: { x: number; y: number };
}
interface OneLineResponse {
  result: { addressMatches: CensusMatch[] };
}

/** Geocode a single address string via the Census single-line API. */
export async function geocodeOne(
  fullAddress: string
): Promise<{ lat: number; lng: number; matched: string } | null> {
  const url = new URL(`${BASE}/locations/onelineaddress`);
  url.searchParams.set('address',   fullAddress);
  url.searchParams.set('benchmark', BENCHMARK);
  url.searchParams.set('format',    'json');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Census geocoder HTTP ${res.status}`);
  const data = (await res.json()) as OneLineResponse;
  const match = data.result.addressMatches?.[0];
  if (!match) return null;
  return { lat: match.coordinates.y, lng: match.coordinates.x, matched: match.matchedAddress };
}

/** Nominatim single-address lookup. */
export async function geocodeNominatim(
  query: string
): Promise<{ lat: number; lng: number; matched: string } | null> {
  const url = new URL(`${NOMINATIM}/search`);
  url.searchParams.set('q',              query);
  url.searchParams.set('format',         'json');
  url.searchParams.set('limit',          '1');
  url.searchParams.set('addressdetails', '0');
  const res = await fetch(url.toString(), { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (data.length === 0) return null;
  return { lat: Number(data[0].lat), lng: Number(data[0].lon), matched: data[0].display_name };
}

/**
 * Bulk-geocode a list of Address records.
 *
 * Each address is looked up individually using the Census single-line GET API
 * (CORS-safe from the browser). Census failures fall back to Nominatim.
 * Non-US addresses go straight to Nominatim.
 */
export async function geocodeBatch(
  addresses: Address[],
  onProgress?: (done: number, total: number) => void
): Promise<Address[]> {
  const updated = addresses.map((a) => ({ ...a }));
  const total   = updated.length;

  for (let i = 0; i < updated.length; i++) {
    const a           = updated[i];
    const queryString = a.fullAddress ?? [a.street, a.city, a.state, a.zip].filter(Boolean).join(', ');
    const isUS        = !a.country || a.country.toUpperCase() === 'US';

    try {
      if (isUS) {
        // Primary: Census single-line GET (no CORS issues)
        const result = await geocodeOne(queryString);
        if (result) {
          a.lat             = result.lat;
          a.lng             = result.lng;
          a.geocodeStatus   = 'matched';
          a.geocodeSource   = 'census';
          a.geocodeMessage  = result.matched;
        } else {
          // Fallback: Nominatim
          const fallback = await geocodeNominatim(queryString);
          if (fallback) {
            a.lat            = fallback.lat;
            a.lng            = fallback.lng;
            a.geocodeStatus  = 'matched';
            a.geocodeSource  = 'nominatim';
            a.geocodeMessage = fallback.matched + ' (Census: no match; Nominatim fallback)';
            if (NOMINATIM_NEEDS_THROTTLE) await sleep(1100);
          } else {
            a.geocodeStatus  = 'unmatched';
            a.geocodeMessage = 'No match found';
          }
        }
      } else {
        // International: Nominatim only
        const result = await geocodeNominatim(queryString);
        if (result) {
          a.lat            = result.lat;
          a.lng            = result.lng;
          a.geocodeStatus  = 'matched';
          a.geocodeSource  = 'nominatim';
          a.geocodeMessage = result.matched;
        } else {
          a.geocodeStatus  = 'unmatched';
          a.geocodeMessage = 'Nominatim: no match';
        }
        if (NOMINATIM_NEEDS_THROTTLE) await sleep(1100);
      }
    } catch (err) {
      a.geocodeStatus  = 'failed';
      a.geocodeMessage = (err as Error).message;
    }

    onProgress?.(i + 1, total);
  }

  return updated;
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
