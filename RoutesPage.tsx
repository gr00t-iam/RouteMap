import { useState, useRef } from 'react';
import { useApp } from './store';
import type { Address, Route, RouteStop, Technician } from './store';
import MapView from './MapView';

// SheetJS loaded via CDN in index.html as window.XLSX (no npm package needed)

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
  const data = group.addresses.map((a, i) => ({
    '#': i + 1,
    'Address': a.raw || String(a.street ?? ''),
    'City': String(a.city ?? ''),
    'State': String(a.state ?? ''),
    'ZIP': String(a.zip ?? ''),
    'Lat': a.lat ?? '',
    'Lng': a.lng ?? '',
    'Google Maps': `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a.raw || '')}`,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{ wch: 4 }, { wch: 42 }, { wch: 20 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 60 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, group.label.slice(0, 31));
  XLSX.writeFile(wb, `${group.label.replace(/[^a-z0-9]/gi, '_')}.xlsx`);
}

function exportPdf(group: RouteGroup) {
  const miles = routeMiles(group.addresses).toFixed(1);
  const rows = group.addresses.map((a, i) =>
    `<tr style="background:${i % 2 === 0 ? '#f8fafc' : '#fff'}">
      <td style="padding:5px 8px;color:#94a3b8;font-family:monospace">${i + 1}</td>
      <td style="padding:5px 8px;font-weight:500">${a.raw || String(a.street ?? '')}</td>
      <td style="padding:5px 8px;color:#475569">${String(a.city ?? '')}</td>
      <td style="padding:5px 8px;color:#475569">${String(a.state ?? '')}</td>
      <td style="padding:5px 8px;color:#475569">${String(a.zip ?? '')}</td>
    </tr>`
  ).join('');

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
    <table><thead><tr><th>#</th><th>Address</th><th>City</th><th>State</th><th>ZIP</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <script>window.onload=function(){window.print()}<\/script>
    </body></html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (win) { win.document.write(html); win.document.close(); }
}

function exportCsv(group: RouteGroup) {
  const header = '#,Address,City,State,ZIP,Lat,Lng,GoogleMaps';
  const rows = group.addresses.map((a, i) =>
    [i + 1, a.raw || String(a.street ?? ''), a.city, a.state, a.zip, a.lat, a.lng,
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a.raw || '')}`]
      .map((v) => `"${v ?? ''}"`).join(',')
  );
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${group.label.replace(/[^a-z0-9]/gi, '_')}.csv`; a.click();
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
    let rawGroups: { techId: string; label: string; color: string; pts: Address[]; day?: number }[] = [];

    if (splitMode === 'technician' && technicians.length > 0) {
      const sorted = [...geocoded].sort((a, b) => (a.lng ?? 0) - (b.lng ?? 0));
      technicians.forEach((t, i) => {
        rawGroups.push({ techId: t.id, label: t.name, color: t.color, pts: sorted.filter((_, idx) => idx % technicians.length === i) });
      });
    } else if (splitMode === 'single') {
      const t = technicians[0];
      rawGroups = [{ techId: t?.id ?? 'single', label: t?.name ?? 'Route 1', color: t?.color ?? FALLBACK_COLORS[0], pts: geocoded }];
    } else if (splitMode === 'east-west') {
      rawGroups = [
        { techId: technicians[0]?.id ?? 'east', label: technicians[0]?.name ?? 'East Coast', color: technicians[0]?.color ?? FALLBACK_COLORS[0], pts: geocoded.filter((a) => (a.lng ?? 0) >= SPLIT_LNG) },
        { techId: technicians[1]?.id ?? 'west', label: technicians[1]?.name ?? 'West Coast', color: technicians[1]?.color ?? FALLBACK_COLORS[1], pts: geocoded.filter((a) => (a.lng ?? 0) < SPLIT_LNG) },
      ];
    } else {
      const sorted = balanceMode === 'distance' ? [...geocoded].sort((a, b) => (a.lng ?? 0) - (b.lng ?? 0)) : geocoded;
      const size = Math.ceil(sorted.length / days);
      for (let i = 0; i < days; i++) {
        const pts = sorted.slice(i * size, (i + 1) * size);
        if (!pts.length) continue;
        const t = technicians[i];
        rawGroups.push({ techId: t?.id ?? `day-${i}`, label: t?.name ?? `Day ${i + 1}`, color: t?.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length], pts, day: i + 1 });
      }
    }

    const optimizedGroups: RouteGroup[] = rawGroups.filter((g) => g.pts.length > 0).map((g) => ({ ...g, addresses: nearestNeighbor(g.pts) }));
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
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        {['#','Address','City','State','ZIP'].map((h) => (
                          <th key={h} className="text-left px-3 py-2 text-slate-500 font-medium">{h}</th>
                        ))}
                        <th className="text-left px-3 py-2 text-slate-500 font-medium no-print">Navigate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {group.addresses.map((a, i) => (
                        <tr key={a.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-slate-400 font-mono text-xs">{i + 1}</td>
                          <td className="px-3 py-2 font-medium">{a.raw || String(a.street ?? '')}</td>
                          <td className="px-3 py-2 text-slate-600">{String(a.city ?? '')}</td>
                          <td className="px-3 py-2 text-slate-600">{String(a.state ?? '')}</td>
                          <td className="px-3 py-2 text-slate-600">{String(a.zip ?? '')}</td>
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
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
