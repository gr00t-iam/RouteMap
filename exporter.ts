// Export optimized routes as .xlsx or .csv.
// Each technician gets their own sheet (xlsx) or their own file (csv zipped).
// Optionally includes a turn-by-turn directions sheet.

import * as XLSX from 'xlsx-js-style';
import { saveAs } from 'file-saver';
import type { Address, Route, Technician } from '@/types';

export interface ExportOptions {
  filename?: string;             // base file name (no extension)
  includeDirections?: boolean;   // append a per-tech directions sheet
  technicianFilter?: string[];   // restrict to these technician ids (for "send only their route" use case)
}

interface RouteExportRow {
  'Stop #': number;
  'Store #': string;
  'Location Name': string;
  Street: string;
  City: string;
  State: string;
  ZIP: string;
  Country: string;
  International: string;
  Latitude: number | '';
  Longitude: number | '';
  'Leg Distance (mi)': number | '';
  'Leg Duration (min)': number | '';
  Notes: string;
}

export function buildRouteRows(
  route: Route,
  addresses: Map<string, Address>
): RouteExportRow[] {
  return route.stops.map((stop, idx) => {
    const a = addresses.get(stop.addressId);
    const distMi = stop.legDistanceMeters !== undefined ? Number((stop.legDistanceMeters / 1609.344).toFixed(2)) : '';
    const durMin = stop.legDurationSeconds !== undefined ? Math.round(stop.legDurationSeconds / 60) : '';
    return {
      'Stop #': idx + 1,
      'Store #': a?.storeNumber ?? '',
      'Location Name': a?.name ?? '',
      Street: a?.street ?? '',
      City: a?.city ?? '',
      State: a?.state ?? '',
      ZIP: a?.zip ?? '',
      Country: a?.country ?? '',
      International: a?.isInternational ? 'Yes' : 'No',
      Latitude: a?.lat ?? '',
      Longitude: a?.lng ?? '',
      'Leg Distance (mi)': distMi,
      'Leg Duration (min)': durMin,
      Notes: a?.notes ?? '',
    };
  });
}

/**
 * Export all routes as a single workbook. One sheet per technician, plus a
 * "Summary" sheet at the front. Triggers a browser download.
 */
export function exportXlsx(
  routes: Route[],
  technicians: Technician[],
  addresses: Address[],
  directionsByRoute: Map<string, string[]> | null,
  opts: ExportOptions = {}
) {
  const addrMap = new Map(addresses.map((a) => [a.id, a]));
  const techMap = new Map(technicians.map((t) => [t.id, t]));
  const wb = XLSX.utils.book_new();

  // Summary sheet — one row per technician's route, plus an aggregate "All routes" row at the end.
  // Each route is scoped to a country, so a tech with both US + international stops appears
  // on multiple rows (one per country).
  const summaryRows = routes.map((r) => {
    const tech = techMap.get(r.technicianId);
    const legs = Math.max(0, r.stops.length - 1);
    return {
      Technician: tech?.name ?? r.technicianId,
      Country: r.country,
      International: r.country === 'US' ? 'No' : 'Yes',
      Stops: r.stops.length,
      'Total Distance (mi)': Number((r.totalDistanceMeters / 1609.344).toFixed(1)),
      'Total Duration (h)': Number((r.totalDurationSeconds / 3600).toFixed(2)),
      'Avg Leg Distance (mi)': legs > 0 ? Number(((r.totalDistanceMeters / 1609.344) / legs).toFixed(2)) : 0,
      'Avg Leg Duration (min)': legs > 0 ? Number(((r.totalDurationSeconds / 60) / legs).toFixed(1)) : 0,
      'Computed At': r.computedAt,
    };
  });
  const totals = aggregate(routes);
  if (summaryRows.length > 1) {
    summaryRows.push({
      Technician: 'ALL ROUTES',
      Country: '—',
      International: '—',
      Stops: totals.stops,
      'Total Distance (mi)': Number(totals.totalMiles.toFixed(1)),
      'Total Duration (h)': Number(totals.totalHours.toFixed(2)),
      'Avg Leg Distance (mi)': Number(totals.avgLegMiles.toFixed(2)),
      'Avg Leg Duration (min)': Number(totals.avgLegMinutes.toFixed(1)),
      'Computed At': '',
    });
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');

  const filtered = opts.technicianFilter
    ? routes.filter((r) => opts.technicianFilter!.includes(r.technicianId))
    : routes;

  for (const route of filtered) {
    const tech = techMap.get(route.technicianId);
    // Include country in the sheet name so a tech with US + intl routes gets distinct sheets.
    const baseName = sanitize(tech?.name ?? route.technicianId).slice(0, 24) || 'Route';
    const sheetName = (`${baseName} ${route.country}`).slice(0, 31);
    const rows = buildRouteRows(route, addrMap);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);

    if (opts.includeDirections && directionsByRoute?.has(route.id)) {
      const directions = directionsByRoute.get(route.id)!;
      const sheet = XLSX.utils.aoa_to_sheet([['Step', 'Instruction'], ...directions.map((d, i) => [i + 1, d])]);
      XLSX.utils.book_append_sheet(wb, sheet, `${sheetName} Dir`.slice(0, 31));
    }
  }

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([out], { type: 'application/octet-stream' }), `${opts.filename ?? 'routes'}.xlsx`);
}

/**
 * Export a single technician's routes as .xlsx — used when you want to send
 * "only their route" so techs can't see each other's assignments.
 *
 * A technician may have multiple Route records if they have stops in more than
 * one country. We produce one Route Summary sheet (covering all of them) plus
 * one route+directions sheet per country.
 */
export function exportTechnicianXlsx(
  techRoutes: Route[],
  technician: Technician,
  addresses: Address[],
  directionsByRoute: Map<string, string[]> | null,
  opts: ExportOptions = {}
) {
  const addrMap = new Map(addresses.map((a) => [a.id, a]));
  const wb = XLSX.utils.book_new();

  // Aggregate Route Summary at the top (per country + grand total).
  const summary: (string | number)[][] = [
    ['Technician', technician.name],
    ['Routes', techRoutes.length],
    [],
    ['Country', 'Stops', 'Total Distance (mi)', 'Total Duration (h)', 'Avg Leg Distance (mi)', 'Avg Leg Duration (min)'],
  ];
  let gStops = 0, gMeters = 0, gSeconds = 0, gLegs = 0;
  for (const route of techRoutes) {
    const legs = Math.max(0, route.stops.length - 1);
    const totalMi = route.totalDistanceMeters / 1609.344;
    const totalHr = route.totalDurationSeconds / 3600;
    summary.push([
      route.country,
      route.stops.length,
      Number(totalMi.toFixed(1)),
      Number(totalHr.toFixed(2)),
      legs > 0 ? Number((totalMi / legs).toFixed(2)) : 0,
      legs > 0 ? Number(((route.totalDurationSeconds / 60) / legs).toFixed(1)) : 0,
    ]);
    gStops += route.stops.length;
    gMeters += route.totalDistanceMeters;
    gSeconds += route.totalDurationSeconds;
    gLegs += legs;
  }
  if (techRoutes.length > 1) {
    const gMi = gMeters / 1609.344;
    summary.push([
      'ALL',
      gStops,
      Number(gMi.toFixed(1)),
      Number((gSeconds / 3600).toFixed(2)),
      gLegs > 0 ? Number((gMi / gLegs).toFixed(2)) : 0,
      gLegs > 0 ? Number(((gSeconds / 60) / gLegs).toFixed(1)) : 0,
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Route Summary');

  // One sheet per route (per country).
  for (const route of techRoutes) {
    const sheetName = `Route ${route.country}`.slice(0, 31);
    const rows = buildRouteRows(route, addrMap);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);
    const directions = directionsByRoute?.get(route.id);
    if (directions && directions.length) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([['Step', 'Instruction'], ...directions.map((d, i) => [i + 1, d])]),
        `Dir ${route.country}`.slice(0, 31)
      );
    }
  }

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const safeName = sanitize(technician.name) || 'technician';
  saveAs(new Blob([out], { type: 'application/octet-stream' }), `${opts.filename ?? safeName}-route.xlsx`);
}

function aggregate(routes: Route[]) {
  let totalMeters = 0, totalSeconds = 0, stops = 0, legs = 0;
  for (const r of routes) {
    totalMeters += r.totalDistanceMeters;
    totalSeconds += r.totalDurationSeconds;
    stops += r.stops.length;
    legs += Math.max(0, r.stops.length - 1);
  }
  const totalMiles = totalMeters / 1609.344;
  const totalHours = totalSeconds / 3600;
  return {
    stops,
    legs,
    totalMiles,
    totalHours,
    avgLegMiles: legs > 0 ? totalMiles / legs : 0,
    avgLegMinutes: legs > 0 ? (totalSeconds / 60) / legs : 0,
  };
}

/** Export a technician's routes as CSV (no directions).
 *  If the tech has US + international, all rows go into one CSV with a Country column
 *  separating them — that's the simplest way to keep "one tech = one file" in CSV.
 */
export function exportTechnicianCsv(
  techRoutes: Route[],
  technician: Technician,
  addresses: Address[]
) {
  const addrMap = new Map(addresses.map((a) => [a.id, a]));
  const allRows = techRoutes.flatMap((r) => buildRouteRows(r, addrMap));
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(allRows));
  const safeName = sanitize(technician.name) || 'technician';
  saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${safeName}-route.csv`);
}

function sanitize(s: string): string {
  return s.replace(/[\\/?*[\]:]/g, '').trim();
}
