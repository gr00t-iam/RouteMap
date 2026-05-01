import { useState } from 'react';
import { useApp } from './store';
import type { Address } from './store';
import MapView from './MapView';

// Haversine distance in miles (duplicated here so DashboardPage has no cross-file dep on RoutesPage)
function haversine(a: Address, b: Address): number {
  const R = 3958.8;
  const dLat = ((b.lat! - a.lat!) * Math.PI) / 180;
  const dLng = ((b.lng! - a.lng!) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos((a.lat! * Math.PI) / 180) * Math.cos((b.lat! * Math.PI) / 180) * sinLng * sinLng;
  return R * 2 * Math.asin(Math.sqrt(h));
}

// Average driving speed assumption (mph) — conservative mix of city + highway
const AVG_MPH = 38;

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

export default function DashboardPage() {
  const { addresses, technicians, routes } = useApp();
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterState, setFilterState] = useState('all');
  const [showHeatmap, setShowHeatmap] = useState(false);

  const geocoded = addresses.filter((a) => a.geocodeStatus === 'geocoded');
  const failed = addresses.filter((a) => a.geocodeStatus === 'failed');
  const pending = addresses.filter((a) => a.geocodeStatus === 'pending');
  const allStates = Array.from(new Set(addresses.map((a) => a.state).filter(Boolean))).sort() as string[];
  const empty = addresses.length === 0;

  // ── Route stats from stored optimized routes ───────────────────────────
  const addrMap = new Map(addresses.map((a) => [a.id, a]));
  let totalMiles = 0;
  let totalStopsInRoutes = 0;

  for (const route of routes) {
    const stops = [...route.stops]
      .sort((a, b) => a.order - b.order)
      .map((s) => addrMap.get(s.addressId))
      .filter((a): a is Address => !!a && a.lat != null && a.lng != null);
    totalStopsInRoutes += stops.length;
    for (let i = 1; i < stops.length; i++) {
      totalMiles += haversine(stops[i - 1], stops[i]);
    }
  }

  const totalHours = totalMiles / AVG_MPH;
  const hasRoutes = routes.length > 0 && totalMiles > 0;

  return (
    <div className="flex flex-col h-full gap-4 p-4">

      {/* ── Address stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-3">
          <p className="label">Total Stops</p>
          <p className="text-2xl font-bold text-slate-800">{addresses.length}</p>
        </div>
        <div className="card p-3">
          <p className="label">Geocoded</p>
          <p className="text-2xl font-bold text-green-600">{geocoded.length}</p>
        </div>
        <div className="card p-3">
          <p className="label">Pending</p>
          <p className="text-2xl font-bold text-amber-500">{pending.length}</p>
        </div>
        <div className="card p-3">
          <p className="label">Failed</p>
          <p className="text-2xl font-bold text-rose-500">{failed.length}</p>
        </div>
      </div>

      {/* ── Route totals (only shown after optimization) ── */}
      {hasRoutes && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card p-3 border-l-4 border-blue-500">
            <p className="label">Routes</p>
            <p className="text-2xl font-bold text-blue-600">{routes.length}</p>
          </div>
          <div className="card p-3 border-l-4 border-blue-500">
            <p className="label">Stops Assigned</p>
            <p className="text-2xl font-bold text-blue-600">{totalStopsInRoutes}</p>
          </div>
          <div className="card p-3 border-l-4 border-indigo-500">
            <p className="label">Total Distance</p>
            <p className="text-2xl font-bold text-indigo-600">{totalMiles.toFixed(0)} mi</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {routes.length > 1 ? `~${(totalMiles / routes.length).toFixed(0)} mi / route` : ''}
            </p>
          </div>
          <div className="card p-3 border-l-4 border-violet-500">
            <p className="label">Est. Drive Time</p>
            <p className="text-2xl font-bold text-violet-600">{formatHours(totalHours)}</p>
            <p className="text-xs text-slate-400 mt-0.5">@ {AVG_MPH} mph avg</p>
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      {!empty && (
        <div className="card p-3 flex flex-wrap gap-3 items-center">
          <div>
            <label className="label">Filter by Status</label>
            <select className="input w-auto" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="geocoded">Geocoded</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          {allStates.length > 0 && (
            <div>
              <label className="label">Filter by State</label>
              <select className="input w-auto" value={filterState} onChange={(e) => setFilterState(e.target.value)}>
                <option value="all">All States</option>
                {allStates.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2 pt-4">
            <input type="checkbox" id="heatmap" checked={showHeatmap}
              onChange={(e) => setShowHeatmap(e.target.checked)} className="w-4 h-4" />
            <label htmlFor="heatmap" className="text-sm text-slate-600 cursor-pointer">Heatmap overlay</label>
          </div>
        </div>
      )}

      {/* ── Map ── */}
      <div className="card flex-1 overflow-hidden min-h-[400px]">
        {empty ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
            <svg className="w-16 h-16 opacity-30" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503-10.498l4.875 2.437c.381.19.622.58.622 1.006V17.25a.75.75 0 01-.622.74l-5.003 1.25a.75.75 0 01-.376 0l-5.003-1.25a.75.75 0 01-.622-.74V7.695c0-.426.24-.816.622-1.006l4.875-2.437a.75.75 0 01.756 0z" />
            </svg>
            <p className="text-lg font-medium">No data yet</p>
            <p className="text-sm">Import addresses to get started</p>
          </div>
        ) : (
          <MapView
            addresses={addresses}
            technicians={technicians}
            routes={routes}
            filterStatus={filterStatus}
            filterState={filterState}
            showHeatmap={showHeatmap}
          />
        )}
      </div>
    </div>
  );
}
