import { useState, useRef } from 'react';
import { useApp } from './store';
import type { Address, Route, RouteStop, Technician } from './store';
import { getExtraColumns } from './ImportPage';
import MapView from './MapView';

// SheetJS loaded via CDN in index.html as window.XLSX (no npm package needed)

// ── Territory detection ───────────────────────────────────────────────────────
type Territory = 'contiguous' | 'hawaii' | 'alaska' | 'puerto_rico' | 'usvi' | 'guam' | 'international';

const TERRITORY_LABELS: Record<Territory, string> = {
  contiguous: 'Contiguous US',
  hawaii: 'Hawaii',
  alaska: 'Alaska',
  puerto_rico: 'Puerto Rico',
  usvi: 'US Virgin Islands',
  guam: 'Guam / CNMI',
  international: 'International',
};

function getTerritory(lat: number, lng: number): Territory {
  if (lat >= 18.5 && lat <= 22.5 && lng >= -161 && lng <= -154) return 'hawaii';
  if (lat >= 54 && lng <= -129) return 'alaska';
  if (lat >= 17.5 && lat <= 18.6 && lng >= -68 && lng <= -65.5) return 'puerto_rico';
  if (lat >= 17.5 && lat <= 18.5 && lng >= -65.5 && lng <= -64.5) return 'usvi';
  if (lat >= 13 && lat <= 21 && lng >= 144 && lng <= 147) return 'guam';
  if (lat >= 24 && lat <= 50 && lng >= -125 && lng <= -65) return 'contiguous';
  return 'international';
}

/** Separate non-contiguous territories from contiguous US.
 *  Returns { contiguous: Address[], territories: Map<Territory, Address[]> } */
function partitionByTerritory(addresses: Address[]) {
  const contiguous: Address[] = [];
  const territories = new Map<Territory, Address[]>();
  for (const a of addresses) {
    if (a.lat == null || a.lng == null) continue;
    const t = getTerritory(a.lat as number, a.lng as number);
    if (t === 'contiguous') {
      contiguous.push(a);
    } else {
      if (!territories.has(t)) territories.set(t, []);
      territories.get(t)!.push(a);
    }
  }
  return { contiguous, territories };
}

function haversine(a: Address, b: Address): number {
  const R = 3958.8;
  const dLat = ((b.lat! - a.lat!) * Math.PI) / 180;
  const dLng = ((b.lng! - a.lng!) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos((a.lat! * Math.PI) / 180) * Math.cos((b.lat! * Math.PI) / 180) * sinLng * sinLng;
  return R * 2 * Math.asin(Math.sqrt(h));
}

function nearestNeighbor(pts: Address[]): Address[] {
  if (!pts.length) return [];
  const rem = [...pts];
  const route: Address[] = [rem.splice(0, 1)[0]];
  while (rem.length) {
    const last = route[route.length - 1];
    let bi = 0, bd = Infinity;
    for (let i = 0; i < rem.length; i++) {
      const d = haversine(last, rem[i]);
      if (d < bd) { bd = d; bi = i; }
    }
    route.push(rem.splice(bi, 1)[0]);
  }
  return route;
}

/** 2-opt improvement: repeatedly swap pairs of edges to reduce total distance */
function twoOpt(route: Address[]): Address[] {
  if (route.length < 4) return route;
  let best = [...route];
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 2; j < best.length; j++) {
        // Skip wrap-around edge for open routes
        if (i === 0 && j === best.length - 1) continue;
        const before = haversine(best[i], best[i + 1]) + haversine(best[j], best[(j + 1) % best.length]);
        const after  = haversine(best[i], best[j])     + haversine(best[i + 1], best[(j + 1) % best.length]);
        if (after < before - 0.001) {
          // Reverse the segment between i+1 and j
          best = [...best.slice(0, i + 1), ...best.slice(i + 1, j + 1).reverse(), ...best.slice(j + 1)];
          improved = true;
        }
      }
    }
  }
  return best;
}

/** Full shortest-distance optimization: nearest-neighbor seed + 2-opt refinement */
function optimizeRoute(pts: Address[]): Address[] {
  return twoOpt(nearestNeighbor(pts));
}

function routeMiles(stops: Address[]): number {
  let t = 0;
  for (let i = 1; i < stops.length; i++) t += haversine(stops[i - 1], stops[i]);
  return t;
}

const SPLIT_LNG = -100;
const FALLBACK_COLORS = ['#3b82f6','#f97316','#a855f7','#10b981','#ec4899','#f59e0b','#6366f1','#14b8a6'];

type SplitMode = 'technician' | 'single' | 'east-west' | 'multi-day';
type BalanceMode = 'stops' | 'distance';

interface RouteGroup {
  techId: string;
  label: string;
  color: string;
  addresses: Address[];
  day?: number;
}

function exportXlsx(group: RouteGroup) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const XLSX = (window as any).XLSX;
  if (!XLSX) { alert('Spreadsheet library not loaded. Refresh and try again.'); return; }
  const extraCols = getExtraColumns(group.addresses);
  const data = group.addresses.map((a, i) => {
    const row: Record<string, unknown> = { '#': i + 1 };
    if (a.storeNumber) row['Store #'] = a.storeNumber;
    row['Address'] = a.raw || String(a.street ?? '');
    row['City'] = String(a.city ?? '');
    row['State'] = String(a.state ?? '');
    row['ZIP'] = String(a.zip ?? '');
    // All original spreadsheet columns
    for (const col of extraCols) row[col] = a[col] ?? '';
    row['Lat'] = a.lat ?? '';
    row['Lng'] = a.lng ?? '';
    row['Google Maps'] = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a.raw || '')}`;
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  // Auto column widths: standard + extras
  ws['!cols'] = [
    { wch: 4 }, ...(data[0]?.['Store #'] !== undefined ? [{ wch: 12 }] : []),
    { wch: 42 }, { wch: 20 }, { wch: 8 }, { wch: 10 },
    ...extraCols.map(() => ({ wch: 18 })),
    { wch: 10 }, { wch: 10 }, { wch: 60 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, group.label.slice(0, 31));
  XLSX.writeFile(wb, `${group.label.replace(/[^a-z0-9]/gi, '_')}.xlsx`);
}

function exportPdf(group: RouteGroup) {
  const miles = routeMiles(group.addresses).toFixed(1);
  const extraCols = getExtraColumns(group.addresses);
  const hasStore = group.addresses.some((a) => a.storeNumber);

  const headerCells = [
    '<th>#</th>',
    hasStore ? '<th>Store #</th>' : '',
    '<th>Address</th><th>City</th><th>State</th><th>ZIP</th>',
    ...extraCols.map((c) => `<th>${c}</th>`),
  ].join('');

  const rows = group.addresses.map((a, i) => {
    const extraCells = extraCols.map((c) => `<td>${String(a[c] ?? '')}</td>`).join('');
    return `<tr style="background:${i % 2 === 0 ? '#f8fafc' : '#fff'}">
      <td style="padding:5px 8px;color:#94a3b8;font-family:monospace">${i + 1}</td>
      ${hasStore ? `<td style="padding:5px 8px;font-weight:700;color:#1d4ed8">${a.storeNumber ? '#' + a.storeNumber : ''}</td>` : ''}
      <td style="padding:5px 8px;font-weight:500">${a.raw || String(a.street ?? '')}</td>
      <td style="padding:5px 8px;color:#475569">${String(a.city ?? '')}</td>
      <td style="padding:5px 8px;color:#475569">${String(a.state ?? '')}</td>
      <td style="padding:5px 8px;color:#475569">${String(a.zip ?? '')}</td>
      ${extraCells}
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>${group.label} Route</title>
    <style>
      body{font-family:Arial,sans-serif;padding:20px;color:#1e293b}
      h1{font-size:20px;margin:0 0 4px}
      .meta{font-size:12px;color:#64748b;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th{background:${group.color};color:#fff;padding:7px 8px;text-align:left;font-weight:600}
      td{border-bottom:1px solid #e2e8f0}
      @media print{@page{margin:1.5cm}body{padding:0}}
    </style></head><body>
    <h1>Route Sheet — ${group.label}</h1>
    <p class="meta">${group.addresses.length} stops &middot; ${miles} mi estimated &middot; ${new Date().toLocaleDateString()}</p>
    <table><thead><tr style="background:${group.color}">${headerCells}</tr></thead>
    <tbody>${rows}</tbody></table>
    <script>window.onload=function(){window.print()}<\/script>
    </body></html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (win) { win.document.write(html); win.document.close(); }
}

function exportCsv(group: RouteGroup) {
  const extraCols = getExtraColumns(group.addresses);
  const hasStore = group.addresses.some((a) => a.storeNumber);
  const stdCols = ['#', ...(hasStore ? ['Store #'] : []), 'Address', 'City', 'State', 'ZIP', ...extraCols, 'Lat', 'Lng', 'GoogleMaps'];
  const header = stdCols.map((c) => `"${c}"`).join(',');
  const rows = group.addresses.map((a, i) => {
    const vals: unknown[] = [i + 1];
    if (hasStore) vals.push(a.storeNumber ?? '');
    vals.push(a.raw || String(a.street ?? ''), a.city ?? '', a.state ?? '', a.zip ?? '');
    for (const c of extraCols) vals.push(a[c] ?? '');
    vals.push(a.lat ?? '', a.lng ?? '', `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a.raw || '')}`);
    return vals.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.href = url; el.download = `${group.label.replace(/[^a-z0-9]/gi, '_')}.csv`; el.click();
  URL.revokeObjectURL(url);
}

export default function RoutesPage() {
  const { addresses, technicians, setRoutes } = useApp();
  const [splitMode, setSplitMode] = useState<SplitMode>('single');
  const [balanceMode, setBalanceMode] = useState<BalanceMode>('stops');
  const [days, setDays] = useState(2);
  const [groups, setGroups] = useState<RouteGroup[]>([]);
  const [optimized, setOptimized] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const geocoded = addresses.filter((a) => a.lat != null && a.lng != null);

  const handleOptimize = () => {
    // Step 1: separate non-contiguous territories (Hawaii, Alaska, PR, etc.)
    const { contiguous, territories } = partitionByTerritory(geocoded);

    // Step 2: build groups for contiguous US using the chosen split mode
    let rawGroups: { techId: string; label: string; color: string; pts: Address[]; day?: number }[] = [];
    let colorIdx = 0;

    if (splitMode === 'technician' && technicians.length > 0) {
      const sorted = [...contiguous].sort((a, b) => (a.lng ?? 0) - (b.lng ?? 0));
      technicians.forEach((t, i) => {
        rawGroups.push({ techId: t.id, label: t.name, color: t.color, pts: sorted.filter((_, idx) => idx % technicians.length === i) });
      });
      colorIdx = technicians.length;
    } else if (splitMode === 'single') {
      const t = technicians[0];
      rawGroups = [{ techId: t?.id ?? 'single', label: t?.name ?? 'Route', color: t?.color ?? FALLBACK_COLORS[0], pts: contiguous }];
      colorIdx = 1;
    } else if (splitMode === 'east-west') {
      rawGroups = [
        { techId: technicians[0]?.id ?? 'east', label: technicians[0]?.name ?? 'East Coast', color: technicians[0]?.color ?? FALLBACK_COLORS[0], pts: contiguous.filter((a) => (a.lng ?? 0) >= SPLIT_LNG) },
        { techId: technicians[1]?.id ?? 'west', label: technicians[1]?.name ?? 'West Coast', color: technicians[1]?.color ?? FALLBACK_COLORS[1], pts: contiguous.filter((a) => (a.lng ?? 0) < SPLIT_LNG) },
      ];
      colorIdx = 2;
    } else {
      const sorted = balanceMode === 'distance' ? [...contiguous].sort((a, b) => (a.lng ?? 0) - (b.lng ?? 0)) : contiguous;
      const size = Math.ceil(sorted.length / days);
      for (let i = 0; i < days; i++) {
        const pts = sorted.slice(i * size, (i + 1) * size);
        if (!pts.length) continue;
        const t = technicians[i];
        rawGroups.push({ techId: t?.id ?? `day-${i}`, label: t?.name ?? `Day ${i + 1}`, color: t?.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length], pts, day: i + 1 });
        colorIdx++;
      }
    }

    // Step 3: add each non-contiguous territory as its own separate route group
    territories.forEach((pts, territory) => {
      if (!pts.length) return;
      const label = TERRITORY_LABELS[territory];
      rawGroups.push({
        techId: `territory-${territory}`,
        label,
        color: FALLBACK_COLORS[colorIdx++ % FALLBACK_COLORS.length],
        pts,
      });
    });

    const optimizedGroups: RouteGroup[] = rawGroups
      .filter((g) => g.pts.length > 0)
      .map((g) => ({ ...g, addresses: optimizeRoute(g.pts) }));

    setGroups(optimizedGroups);
    setOptimized(true);
    setRoutes(optimizedGroups.map((g, i) => ({
      id: `route-${i}`, technicianId: g.techId, day: g.day,
      stops: g.addresses.map((a, order): RouteStop => ({ addressId: a.id, order })),
    })));
  };

  const allAddrs = groups.flatMap((g) => g.addresses);
  const fakeRoutes: Route[] = groups.map((g, i) => ({ id: `route-${i}`, technicianId: g.techId, stops: g.addresses.map((a, order): RouteStop => ({ addressId: a.id, order })) }));
  const fakeTechs: Technician[] = groups.map((g) => ({ id: g.techId, name: g.label, color: g.color }));

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-slate-800">Route Optimizer</h1>
        {optimized && (
          <button className="btn-ghost text-sm no-print" onClick={() => window.print()}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.75 19.5m10.56-5.671L17.25 19.5m0 0l.345 2.623A1.5 1.5 0 0116.11 23.7H7.89a1.5 1.5 0 01-1.485-1.577L6.75 19.5m10.5 0H6.75" />
            </svg>
            Print All Routes
          </button>
        )}
      </div>

      {/* Territory notice */}
      {(() => {
        const { territories } = partitionByTerritory(geocoded);
        if (territories.size === 0) return null;
        const names = Array.from(territories.entries()).map(([t, pts]) => `${TERRITORY_LABELS[t]} (${pts.length})`);
        return (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800 flex gap-2">
            <span className="text-lg">✈️</span>
            <div>
              <strong>Non-contiguous territory stops detected:</strong> {names.join(', ')}.<br />
              <span className="text-xs text-blue-600">These will automatically be placed in their own separate route groups since technicians must fly to these locations. Their drive distances will not be mixed with the contiguous US routes.</span>
            </div>
          </div>
        );
      })()}

      <div className="card p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Split Mode</label>
            <select className="input" value={splitMode} onChange={(e) => setSplitMode(e.target.value as SplitMode)}>
              {technicians.length > 0 && <option value="technician">By Technician ({technicians.length} techs)</option>}
              <option value="single">Single Route</option>
              <option value="east-west">East / West Split</option>
              <option value="multi-day">Multi-Day Planning</option>
            </select>
            {splitMode === 'technician' && technicians.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">Add technicians on the Technicians page first.</p>
            )}
          </div>
          <div>
            <label className="label">Balance By</label>
            <select className="input" value={balanceMode} onChange={(e) => setBalanceMode(e.target.value as BalanceMode)}>
              <option value="stops">Equal Stops</option>
              <option value="distance">Equal Distance (geographic)</option>
            </select>
          </div>
          {splitMode === 'multi-day' && (
            <div>
              <label className="label">Number of Days</label>
              <input type="number" min={2} max={14} className="input" value={days}
                onChange={(e) => setDays(Math.max(2, Math.min(14, Number(e.target.value))))} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button className="btn-primary" disabled={geocoded.length === 0} onClick={handleOptimize}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {geocoded.length === 0 ? 'No geocoded addresses' : `Optimize ${geocoded.length} Stops`}
          </button>
          {geocoded.length === 0 && addresses.length > 0 && (
            <p className="text-sm text-amber-600">Geocode addresses on the Import page first.</p>
          )}
        </div>
      </div>

      {optimized && groups.length > 0 && (
        <div className="card overflow-hidden no-print" style={{ height: 360 }}>
          <MapView addresses={allAddrs} technicians={fakeTechs} routes={fakeRoutes} />
        </div>
      )}

      {optimized && (
        <div ref={printRef} className="space-y-4 print-area">
          {groups.map((group) => {
            const miles = routeMiles(group.addresses);
            return (
              <div key={group.techId} className="card overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2"
                  style={{ backgroundColor: group.color + '18', borderBottom: `3px solid ${group.color}` }}>
                  <div>
                    <h2 className="font-bold text-slate-800 text-lg">{group.label}</h2>
                    <p className="text-xs text-slate-500">{group.addresses.length} stops &middot; {miles.toFixed(1)} mi estimated</p>
                  </div>
                  <div className="flex gap-2 no-print flex-wrap">
                    <button className="btn-ghost text-xs border border-slate-200" onClick={() => exportCsv(group)}>⬇ CSV</button>
                    <button className="btn-ghost text-xs border border-slate-200" onClick={() => exportXlsx(group)}>⬇ Excel</button>
                    <button className="btn-primary text-xs" onClick={() => exportPdf(group)}>⬇ PDF</button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  {(() => {
                    const extraCols = getExtraColumns(group.addresses);
                    const hasStore = group.addresses.some((a) => a.storeNumber);
                    return (
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="text-left px-3 py-2 text-slate-500 font-medium">#</th>
                            {hasStore && <th className="text-left px-3 py-2 text-blue-600 font-medium bg-blue-50">Store #</th>}
                            {['Address','City','State','ZIP'].map((h) => (
                              <th key={h} className="text-left px-3 py-2 text-slate-500 font-medium">{h}</th>
                            ))}
                            {extraCols.map((c) => (
                              <th key={c} className="text-left px-3 py-2 text-slate-400 font-medium text-xs">{c}</th>
                            ))}
                            <th className="text-left px-3 py-2 text-slate-500 font-medium no-print">Navigate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {group.addresses.map((a, i) => (
                            <tr key={a.id} className="hover:bg-slate-50">
                              <td className="px-3 py-2 text-slate-400 font-mono text-xs">{i + 1}</td>
                              {hasStore && (
                                <td className="px-3 py-2 font-bold text-blue-700 bg-blue-50/50 whitespace-nowrap">
                                  {a.storeNumber ? `#${a.storeNumber}` : '—'}
                                </td>
                              )}
                              <td className="px-3 py-2 font-medium">{a.raw || String(a.street ?? '')}</td>
                              <td className="px-3 py-2 text-slate-600">{String(a.city ?? '')}</td>
                              <td className="px-3 py-2 text-slate-600">{String(a.state ?? '')}</td>
                              <td className="px-3 py-2 text-slate-600">{String(a.zip ?? '')}</td>
                              {extraCols.map((c) => (
                                <td key={c} className="px-3 py-2 text-slate-500 text-xs max-w-[120px] truncate" title={String(a[c] ?? '')}>
                                  {String(a[c] ?? '')}
                                </td>
                              ))}
                              <td className="px-3 py-2 no-print">
                                <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a.raw || '')}`}
                                  target="_blank" rel="noreferrer" className="text-blue-500 hover:underline text-xs">
                                  Google Maps ↗
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
