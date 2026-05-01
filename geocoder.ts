import type { Address } from './store';

const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

async function geocodeCensus(addr: Address): Promise<{ lat: number; lng: number } | null> {
  const raw = addr.raw || [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', ');
  if (!raw.trim()) return null;
  try {
    const params = new URLSearchParams({
      address: raw,
      benchmark: 'Public_AR_Current',
      format: 'json',
    });
    const res = await fetch(`${CENSUS_URL}?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const matches = data?.result?.addressMatches;
    if (matches && matches.length > 0) {
      const { x, y } = matches[0].coordinates;
      return { lat: parseFloat(y), lng: parseFloat(x) };
    }
  } catch {
    // fall through to Nominatim
  }
  return null;
}

async function geocodeNominatim(addr: Address): Promise<{ lat: number; lng: number } | null> {
  const raw = addr.raw || [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', ');
  if (!raw.trim()) return null;
  try {
    const params = new URLSearchParams({
      q: raw,
      format: 'json',
      limit: '1',
      countrycodes: 'us',
    });
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'RouteMap/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch {
    // ignore
  }
  return null;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

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
    const a = { ...pending[i] };
    const coords = await geocodeCensus(a);
    if (coords) {
      a.lat = coords.lat;
      a.lng = coords.lng;
      a.geocodeStatus = 'geocoded';
    } else {
      // rate-limit Nominatim
      await sleep(1100);
      const coords2 = await geocodeNominatim(a);
      if (coords2) {
        a.lat = coords2.lat;
        a.lng = coords2.lng;
        a.geocodeStatus = 'geocoded';
      } else {
        a.lat = undefined;
        a.lng = undefined;
        a.geocodeStatus = 'failed';
      }
    }
    results.push(a);
    onEach?.(a, i);
    onProgress?.(i + 1, pending.length);
  }
  return results;
}
