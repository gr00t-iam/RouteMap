// OSRM client. Uses two endpoints:
//   /table   — distance/duration matrix between many points
//   /route   — full route polyline + turn-by-turn steps for a given ordering
//
// The public demo (router.project-osrm.org) is rate-limited and meant for
// development only. For 2000+ stops in production, self-host OSRM (Docker) and
// point VITE_OSRM_URL at it.

const OSRM = (import.meta.env.VITE_OSRM_URL as string | undefined) ?? 'https://router.project-osrm.org';

export interface LngLat { lng: number; lat: number; }

export interface RouteLeg {
  distance: number;
  duration: number;
  steps: Array<{
    distance: number;
    duration: number;
    name: string;
    maneuver: { type: string; modifier?: string; instruction?: string; bearing_after?: number };
    geometry?: string;
  }>;
}

export interface OsrmRouteResult {
  distance: number;
  duration: number;
  geometry: string;          // encoded polyline (precision 5)
  legs: RouteLeg[];
}

function fmt(coords: LngLat[]): string {
  return coords.map((c) => `${c.lng.toFixed(6)},${c.lat.toFixed(6)}`).join(';');
}

/**
 * Get a duration (sec) and distance (m) matrix between all coordinates.
 * Returns { durations[i][j], distances[i][j] } in meters / seconds.
 */
export async function table(coords: LngLat[]): Promise<{ durations: number[][]; distances: number[][] }> {
  if (coords.length < 2) return { durations: [[0]], distances: [[0]] };
  const url = `${OSRM}/table/v1/driving/${fmt(coords)}?annotations=duration,distance`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM /table HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 'Ok') throw new Error(`OSRM /table error: ${json.code}`);
  return { durations: json.durations as number[][], distances: json.distances as number[][] };
}

/**
 * Compute a route in the order provided. Use steps=true for turn-by-turn.
 */
export async function route(coords: LngLat[], opts: { steps?: boolean } = {}): Promise<OsrmRouteResult> {
  if (coords.length < 2) {
    return { distance: 0, duration: 0, geometry: '', legs: [] };
  }
  const params = new URLSearchParams({
    overview: 'full',
    geometries: 'polyline',
    steps: opts.steps ? 'true' : 'false',
  });
  const url = `${OSRM}/route/v1/driving/${fmt(coords)}?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM /route HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 'Ok') throw new Error(`OSRM /route error: ${json.code}`);
  const r = json.routes[0];
  return { distance: r.distance, duration: r.duration, geometry: r.geometry, legs: r.legs };
}

/**
 * Convenience: build a one-line, plain-English turn-by-turn list for a route
 * computed with steps=true. Each entry is something like
 * "Turn right onto Main St (0.4 mi, 1 min)".
 */
export function flattenSteps(result: OsrmRouteResult): string[] {
  const out: string[] = [];
  for (const leg of result.legs) {
    for (const step of leg.steps) {
      const dirParts: string[] = [];
      const m = step.maneuver;
      if (m.type) dirParts.push(humanType(m.type));
      if (m.modifier) dirParts.push(m.modifier);
      const dir = dirParts.join(' ');
      const onto = step.name ? ` onto ${step.name}` : '';
      const miles = (step.distance / 1609.344).toFixed(2);
      const mins = Math.max(1, Math.round(step.duration / 60));
      out.push(`${cap(dir)}${onto} (${miles} mi, ${mins} min)`);
    }
  }
  return out;
}

function humanType(t: string): string {
  return t.replace(/_/g, ' ');
}
function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Decode an encoded polyline (precision 5) into [lat, lng] pairs. */
export function decodePolyline(str: string, precision = 5): [number, number][] {
  let index = 0, lat = 0, lng = 0;
  const factor = Math.pow(10, precision);
  const out: [number, number][] = [];
  while (index < str.length) {
    let b: number, shift = 0, result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    out.push([lat / factor, lng / factor]);
  }
  return out;
}
