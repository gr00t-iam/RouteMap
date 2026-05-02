// DashboardPage.tsx

import { useState } from 'react';
import { useApp } from './store';
import MapView from './MapView';
import type { Address } from './store';

// Haversine distance in miles
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

  const geocoded = addresses.filter((a) => a.geocodeStatus === 'geocoded');
  const failed = addresses.filter((a) => a.geocodeStatus === 'failed');
  const pending = addresses.filter((a) => a.geocodeStatus === 'pending');
  const allStates = Array.from(new Set(addresses.map((a) => a.state).filter(Boolean))).sort() as string[];

  // ── Route stats from stored optimized routes ──
  const addrMap = new Map(addresses.map((a) => [a.id, a]));
  let totalMiles = 0;
  let totalLegs = 0; // <-- Count of intervals between stops

  for (const route of routes) {
    const stops = [...route.stops]
      .sort((a, b) => a.order - b.order)
      .map((s) => addrMap.get(s.addressId))
      .filter((a): a is Address => !!a && a.lat != null && a.lng != null);
    
    for (let i = 1; i < stops.length; i++) {
      totalMiles += haversine(stops[i - 1], stops[i]);
      totalLegs++;
    }
  }

  const totalHours = totalMiles / AVG_MPH;

  // Calculate Averages
  const avgMilesPerLeg = totalLegs > 0 ? (totalMiles / totalLegs).toFixed(1) : '0.0';
  const avgTimePerLeg = totalLegs > 0 ? totalHours / totalLegs : 0;

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 items-center justify-between bg-white p-3 rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Status</span>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input w-32 text-sm">
              <option value="all">All</option>
              <option value="geocoded">Geocoded</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase">State</span>
            <select value={filterState} onChange={(e) => setFilterState(e.target.value)} className="input w-32 text-sm">
              <option value="all">All</option>
              {allStates.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Stats Cards ── */}
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
          <p className="label">Avg. Miles / Leg</p>
          <p className="text-2xl font-bold text-slate-800">{avgMilesPerLeg}</p>
        </div>
        <div className="card p-3">
          <p className="label">Avg. Time / Leg</p>
          <p className="text-2xl font-bold text-blue-600">{formatHours(avgTimePerLeg)}</p>
        </div>
      </div>

      {/* ── Map ── */}
      <div className="flex-1 min-h-[400px] bg-slate-100 rounded-xl overflow-hidden border border-slate-200 relative">
        <MapView
          addresses={addresses}
          technicians={technicians}
          routes={routes}
          filterStatus={filterStatus}
          filterState={filterState}
        />
      </div>
    </div>
  );
}
