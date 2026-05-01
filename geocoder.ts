import type { Address } from './store';

const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

async function geocodeCensus(raw: string): Promise<{ lat: number; lng: number } | null> {
  if (!raw.trim()) return null;
  try {
    const params = new URLSearchParams({ address: raw, benchmark: 'Public_AR_Current', format: 'json' });
    const res = await fetch(`${CENSUS_URL}?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const matches = data?.result?.addressMatches;
    if (matches && matches.length > 0) {
      const { x, y } = matches[0].coordinates;
      return { lat: parseFloat(y), lng: parseFloat(x) };
    }
  } catch { /* fall through */ }
  return null;
}

async function geocodeNominatim(raw: string): Promise<{ lat: number; lng: number } | null> {
  if (!raw.trim()) return null;
  try {
    const params = new URLSearchParams({ q: raw, format: 'json', limit: '1', countrycodes: 'us' });
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'RouteMap/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch { /* ignore */ }
  return null;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function resolveCoords(raw: string): Promise<{ lat: number; lng: number } | null> {
  const coords = await geocodeCensus(raw);
  if (coords) return coords;
  await sleep(1100); // Nominatim rate limit
  return geocodeNominatim(raw);
}

/** Geocode a single address (used for manual retry on the Import page) */
export async function geocodeSingle(addr: Address, overrideRaw?: string): Promise<Address> {
  const a = { ...addr };
  const raw = overrideRaw ?? a.raw ?? [a.street, a.city, a.state, a.zip].filter(Boolean).join(', ');
  if (overrideRaw) a.raw = overrideRaw; // persist the corrected address text
  const coords = await resolveCoords(raw);
  if (coords) {
    a.lat = coords.lat;
    a.lng = coords.lng;
    a.geocodeStatus = 'geocoded';
  } else {
    a.lat = undefined;
    a.lng = undefined;
    a.geocodeStatus = 'failed';
  }
  return a;
}

/** Geocode all pending/failed addresses in a list, calling back after each one */
export async function geocodeBatch(
  addresses: Address[],
  onProgress?: (done: number, total: number) => void,
  onEach?: (addr: Address, index: number) => void
): Promise<Address[]> {
  const results: Address[] = [];
  const pending = addresses.filter((a) => a.geocodeStatus !== 'geocoded');
  const already = addresses.filter((a) => a.geocodeStatus === 'geocoded');
  results.push(...already);

  for (let i = 0; i < pending.length; i++) {
    const raw = pending[i].raw || [pending[i].street, pending[i].city, pending[i].state, pending[i].zip].filter(Boolean).join(', ');
    const a = { ...pending[i] };
    const coords = await resolveCoords(raw);
    if (coords) {
      a.lat = coords.lat;
      a.lng = coords.lng;
      a.geocodeStatus = 'geocoded';
    } else {
      a.lat = undefined;
      a.lng = undefined;
      a.geocodeStatus = 'failed';
    }
    results.push(a);
    onEach?.(a, i);
    onProgress?.(i + 1, pending.length);
  }
  return results;
}
