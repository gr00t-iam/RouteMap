// Orchestrates the full "compute optimized routes" pipeline.
// Given current addresses + technicians + assignment, this:
//   1. For each technician, gathers their geocoded addresses.
//   2. Splits those addresses by country (US, MX, CA, etc.) so we never try
//      to drive between continents.
//   3. For each (technician × country) group, calls OSRM /table to get a
//      duration matrix, runs the optimizer (nearest-neighbor + 2-opt), then
//      calls OSRM /route with steps=true for total distance/duration and
//      turn-by-turn directions.
//   4. Returns Route objects + per-route directions. A technician with stops
//      in two countries will produce two Route records, each tagged with a
//      country code so the UI/exports can flag them.

import { uuid } from './uuid';
import { table, route, flattenSteps } from './osrm';
import { optimize } from './optimizer';
import type { Address, Route, Technician } from '@/types';

export interface OrchestratorResult {
  routes: Route[];
  directionsByRoute: Map<string, string[]>;     // route.id -> ["Turn right onto Main St ...", ...]
  geometryByRoute: Map<string, string>;         // route.id -> encoded polyline
  errors: { technicianId: string; message: string }[];
}

export async function computeAllRoutes(
  technicians: Technician[],
  addresses: Address[],
  assignment: Map<string, string[]>,
  options: { withDirections?: boolean; onProgress?: (techName: string) => void } = {}
): Promise<OrchestratorResult> {
  const addrMap = new Map(addresses.map((a) => [a.id, a]));
  const routes: Route[] = [];
  const directionsByRoute = new Map<string, string[]>();
  const geometryByRoute = new Map<string, string>();
  const errors: { technicianId: string; message: string }[] = [];

  for (const tech of technicians) {
    options.onProgress?.(tech.name);
    const ids = assignment.get(tech.id) ?? [];
    const techStops = ids
      .map((id) => addrMap.get(id))
      .filter((a): a is Address => !!a && a.lat !== null && a.lng !== null);

    // Group this technician's stops by country. We'll produce one Route per group.
    const byCountry = new Map<string, Address[]>();
    for (const s of techStops) {
      const c = s.country || 'US';
      if (!byCountry.has(c)) byCountry.set(c, []);
      byCountry.get(c)!.push(s);
    }

    for (const [country, stops] of byCountry.entries()) {
      if (stops.length < 2) {
        routes.push({
          id: uuid(),
          technicianId: tech.id,
          country,
          stops: stops.map((s, i) => ({ addressId: s.id, order: i })),
          totalDistanceMeters: 0,
          totalDurationSeconds: 0,
          computedAt: new Date().toISOString(),
        });
        continue;
      }

      try {
        const coords = stops.map((s) => ({ lng: s.lng as number, lat: s.lat as number }));
        const { durations, distances } = await table(coords);
        const opt = optimize(durations, distances, { startIndex: 0 });
        const orderedStops = opt.order.map((i) => stops[i]);
        const orderedCoords = orderedStops.map((s) => ({ lng: s.lng as number, lat: s.lat as number }));

        // Final OSRM call with steps for turn-by-turn.
        // Heads-up: OSRM only routes regions whose road graph is loaded. The public demo
        // covers most of the world but at limited rate; for a country your self-hosted
        // OSRM doesn't have, /route may fail — in which case we fall back to the matrix
        // distances and skip turn-by-turn for that country.
        let totalDistance = opt.totalDistance;
        let totalDuration = opt.totalDuration;
        let geometry = '';
        let steps: string[] | null = null;
        try {
          const r = await route(orderedCoords, { steps: !!options.withDirections });
          totalDistance = r.distance || opt.totalDistance;
          totalDuration = r.duration || opt.totalDuration;
          geometry = r.geometry;
          if (options.withDirections) steps = flattenSteps(r);
        } catch (routeErr) {
          errors.push({
            technicianId: tech.id,
            message: `${country}: OSRM /route unavailable (${(routeErr as Error).message}); using matrix totals only.`,
          });
        }

        const routeId = uuid();
        routes.push({
          id: routeId,
          technicianId: tech.id,
          country,
          stops: orderedStops.map((s, i) => ({
            addressId: s.id,
            order: i,
            legDistanceMeters: i === 0 ? 0 : opt.legDistances[i - 1],
            legDurationSeconds: i === 0 ? 0 : opt.legDurations[i - 1],
          })),
          totalDistanceMeters: totalDistance,
          totalDurationSeconds: totalDuration,
          computedAt: new Date().toISOString(),
        });
        if (geometry) geometryByRoute.set(routeId, geometry);
        if (steps) directionsByRoute.set(routeId, steps);
      } catch (err) {
        errors.push({ technicianId: tech.id, message: `${country}: ${(err as Error).message}` });
      }
    }
  }

  return { routes, directionsByRoute, geometryByRoute, errors };
}
