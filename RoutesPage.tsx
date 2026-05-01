import { useState, useRef } from 'react';
import { useApp } from './store';
import type { Address, Route, RouteStop, Technician } from './store';
import MapView from './MapView';

// ── Haversine distance in miles ──────────────────────────────────────────────
function haversine(a: Address, b: Address): number {
  const R = 3958.8;
  const dLat = ((b.lat! - a.lat!) * Math.PI) / 180;
  const dLng = ((b.lng! - a.lng!) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos((a.lat! * Math.PI) / 180) * Math.cos((b.lat! * Math.PI) / 180) * sinLng * sinLng;
  return R * 2 * Math.asin(Math.sqrt(h));
}

// ── Nearest-neighbor TSP ─────────────────────────────────────────────────────
function nearestNeighbor(pts: Address[]): Address[] {
  if (pts.length === 0) return [];
  const remaining = [...pts];
  const route: Address[] = [remaining.splice(0, 1)[0]];
  while (remaining.length > 0) {
    const last = route[route.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(last, remaining[i]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    route.push(remaining.splice(bestIdx, 1)[0]);
  }
  return route;
}

function routeTotalMiles(stops: Address[]): number {
  let total = 0;
  for (let i = 1; i < stops.length; i++) total += haversine(stops[i - 1], stops[i]);
  return total;
}

// ── Split addresses into N roughly-equal groups ──────────────────────────────
function splitGroups(addresses: Address[], n: number, mode: 'stops' | 'distance'): Address[][] {
  if (n === 1) return [addresses];
  if (mode === 'stops') {
    const size = Math.ceil(addresses.length / n);
    const groups: Address[][] = [];
    for (let i = 0; i < n; i++) groups.push(addresses.slice(i * size, (i + 1) * size));
    return groups.filter((g) => g.length > 0);
  }
  // distance: sort by longitude then split
  const sorted = [...addresses].sort((a, b) => (a.lng ?? 0) - (b.lng ?? 0));
  const size = Math.ceil(sorted.length / n);
  const groups: Address[][] = [];
  for (let i = 0; i < n; i++) groups.push(sorted.slice(i * size, (i + 1) * size));
  return groups.filter((g) => g.length > 0);
}

const ROUTE_COLORS = ['#3b82f6','#f97316','#a855f7','#10b981','#ec4899','#f59e0b','#6366f1','#14b8a6','#ef4444','#84cc16'];
const SPLIT_LNG = -100;

type SplitMode = 'single' | 'east-west' | 'multi-day';
type BalanceMode = 'stops' | 'distance';

interface RouteGroup {
  label: string;
  color: string;
  addresses: Address[];
  day?: number;
}

export default function RoutesPage() {
  const { addresses, setRoutes, routes } = useApp();
  const [splitMode, setSplitMode] = useState<SplitMode>('single');
  const [balanceMode, setBalanceMode] = useState<BalanceMode>('stops');
  const [days, setDays] = useState(2);
  const [groups, setGroups] = useState<RouteGroup[]>([]);
  const [optimized, setOptimized] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const geocoded = addresses.filter((a) => a.lat != null && a.lng != null);

  const handleOptimize = () => {
    let rawGroups: { label: string; color: string; pts: Address[]; day?: number }[] = [];

    if (splitMode === 'single') {
      rawGroups = [{ label: 'Route 1', color: ROUTE_COLORS[0], pts: geocoded }];
    } else if (splitMode === 'east-west') {
      const east = geocoded.filter((a) => (a.lng ?? 0) >= SPLIT_LNG);
      const west = geocoded.filter((a) => (a.lng ?? 0) < SPLIT_LNG);
      rawGroups = [
        { label: 'East Coast', color: ROUTE_COLORS[0], pts: east },
        { label: 'West Coast', color: ROUTE_COLORS[1], pts: west },
      ];
    } else {
      // multi-day
      const dayGroups = splitGroups(geocoded, days, balanceMode);
      rawGroups = dayGroups.map((pts, i) => ({
        label: `Day ${i + 1}`,
        color: ROUTE_COLORS[i % ROUTE_COLORS.length],
        pts,
        day: i + 1,
      }));
    }

    const optimizedGroups: RouteGroup[] = rawGroups.map((g) => ({
      label: g.label,
      color: g.color,
      addresses: nearestNeighbor(g.pts),
      day: g.day,
    }));

    setGroups(optimizedGroups);
    setOptimized(true);

    // Persist to store as Route objects
    const fakeTechs: Technician[] = optimizedGroups.map((g, i) => ({
      id: `tech-${i}`,
      name: g.label,
      color: g.color,
    }));
    const storeRoutes: Route[] = optimizedGroups.map((g, i) => ({
      id: `route-${i}`,
      technicianId: `tech-${i}`,
      stops: g.addresses.map((a, order): RouteStop => ({ addressId: a.id, order })),
      day: g.day,
    }));
    setRoutes(storeRoutes);
    // store technicians via inline upsert (not exported from store separately)
    void fakeTechs; // used in MapView via routes
  };

  const exportCsv = (group: RouteGroup) => {
    const header = 'Order,Address,City,State,ZIP,Lat,Lng,GoogleMaps';
    const rows = group.addresses.map((a, i) => {
      const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a.raw || '')}`;
      return [i + 1, a.raw || a.street, a.city, a.state, a.zip, a.lat, a.lng, gmaps]
        .map((v) => `"${v ?? ''}"`)
        .join(',');
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${group.label.replace(/\s/g, '_')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  const allOptimizedAddresses = groups.flatMap((g) => g.addresses);
  const fakeRoutes: Route[] = groups.map((g, i) => ({
    id: `route-${i}`,
    technicianId: `tech-${i}`,
    stops: g.addresses.map((a, order): RouteStop => ({ addressId: a.id, order })),
  }));
  const fakeTechnicians: Technician[] = groups.map((g, i) => ({
    id: `tech-${i}`,
    name: g.label,
    color: g.color,
  }));

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Route Optimizer</h1>
        {optimized && (
          <button className="btn-ghost text-sm" onClick={handlePrint}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.75 19.5m10.56-5.671L17.25 19.5m0 0l.345 2.623A1.5 1.5 0 0116.11 23.7H7.89a1.5 1.5 0 01-1.485-1.577L6.75 19.5m10.5 0H6.75" />
            </svg>
            Print Route Sheet
          </button>
        )}
      </div>

      {/* Options */}
      <div className="card p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Split Mode</label>
            <select className="input" value={splitMode} onChange={(e) => setSplitMode(e.target.value as SplitMode)}>
              <option value="single">Single Route</option>
              <option value="east-west">East / West Split</option>
              <option value="multi-day">Multi-Day Planning</option>
            </select>
          </div>
          <div>
            <label className="label">Balance By</label>
            <select className="input" value={balanceMode} onChange={(e) => setBalanceMode(e.target.value as BalanceMode)}>
              <option value="stops">Equal Stops</option>
              <option value="distance">Equal Distance</option>
            </select>
          </div>
          {splitMode === 'multi-day' && (
            <div>
              <label className="label">Number of Days</label>
              <input
                type="number"
                min={2}
                max={14}
                className="input"
                value={days}
                onChange={(e) => setDays(Math.max(2, Math.min(14, Number(e.target.value))))}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            className="btn-primary"
            disabled={geocoded.length === 0}
            onClick={handleOptimize}
          >
            {geocoded.length === 0 ? 'No geocoded addresses' : `Optimize ${geocoded.length} Stops`}
          </button>
          {geocoded.length === 0 && addresses.length > 0 && (
            <p className="text-sm text-amber-600">Run Geocode on the Import page first.</p>
          )}
        </div>
      </div>

      {/* Map preview */}
      {optimized && groups.length > 0 && (
        <div className="card overflow-hidden" style={{ height: 360 }}>
          <MapView
            addresses={allOptimizedAddresses}
            technicians={fakeTechnicians}
            routes={fakeRoutes}
          />
        </div>
      )}

      {/* Route sheets — printable */}
      {optimized && (
        <div ref={printRef} className="space-y-4 print-area">
          {groups.map((group) => {
            const miles = routeTotalMiles(group.addresses);
            return (
              <div key={group.label} className="card overflow-hidden">
                <div
                  className="px-4 py-3 flex items-center justify-between"
                  style={{ backgroundColor: group.color + '20', borderBottom: `3px solid ${group.color}` }}
                >
                  <div>
                    <h2 className="font-bold text-slate-800">{group.label}</h2>
                    <p className="text-xs text-slate-500">
                      {group.addresses.length} stops · {miles.toFixed(1)} mi total
                    </p>
                  </div>
                  <button
                    className="btn-ghost text-xs no-print"
                    onClick={() => exportCsv(group)}
                  >
                    Export CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-slate-500 font-medium w-10">#</th>
                        <th className="text-left px-3 py-2 text-slate-500 font-medium">Address</th>
                        <th className="text-left px-3 py-2 text-slate-500 font-medium">City</th>
                        <th className="text-left px-3 py-2 text-slate-500 font-medium">State</th>
                        <th className="text-left px-3 py-2 text-slate-500 font-medium">ZIP</th>
                        <th className="text-left px-3 py-2 text-slate-500 font-medium no-print">Navigate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {group.addresses.map((a, i) => (
                        <tr key={a.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-slate-400 font-mono">{i + 1}</td>
                          <td className="px-3 py-2 font-medium">{a.raw || (a.street as string)}</td>
                          <td className="px-3 py-2 text-slate-600">{a.city as string}</td>
                          <td className="px-3 py-2 text-slate-600">{a.state as string}</td>
                          <td className="px-3 py-2 text-slate-600">{a.zip as string}</td>
                          <td className="px-3 py-2 no-print">
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a.raw || '')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-500 hover:underline text-xs"
                            >
                              Google Maps
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
