import { useState, useMemo } from 'react';
import { useApp } from '@/lib/store';
import MapView from '@/components/MapView';
import type { Address, Route, Technician } from '@/types';
import { uuid } from '@/uuid';

// ── Distance helpers ──────────────────────────────────────────────────────────
function toRad(d: number) { return (d * Math.PI) / 180; }

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestNeighbor(pts: Address[]): Address[] {
  if (pts.length <= 1) return [...pts];
  const pool = [...pts];
  const route = [pool.splice(0, 1)[0]];
  while (pool.length) {
    const last = route[route.length - 1];
    let bi = 0, bd = Infinity;
    pool.forEach((p, i) => {
      const d = haversine(last.lat!, last.lng!, p.lat!, p.lng!);
      if (d < bd) { bd = d; bi = i; }
    });
    route.push(pool.splice(bi, 1)[0]);
  }
  return route;
}

function routeDist(pts: Address[]): number {
  let t = 0;
  for (let i = 1; i < pts.length; i++)
    t += haversine(pts[i - 1].lat!, pts[i - 1].lng!, pts[i].lat!, pts[i].lng!);
  return t;
}

// ── Types ─────────────────────────────────────────────────────────────────────
type SplitMode = 'single' | 'east-west';

interface RouteGroup { tech: Technician; addrs: Address[]; dist: number; route: Route; }

// 100th meridian – rough East/West US boundary
const SPLIT_LNG = -100;

// ── Component ─────────────────────────────────────────────────────────────────
export default function RoutesPage() {
  const { addresses } = useApp();
  const [splitMode, setSplitMode] = useState<SplitMode>('single');
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups]   = useState<RouteGroup[]>([]);
  const [techs,  setTechs]    = useState<Technician[]>([]);
  const [routes, setRoutes]   = useState<Route[]>([]);

  const geocoded = useMemo(
    () => addresses.filter((a) => a.lat != null && a.lng != null),
    [addresses]
  );

  function optimize() {
    if (!geocoded.length) return;
    setBusy(true); setError(null);
    try {
      const raw: { name: string; color: string; pts: Address[] }[] =
        splitMode === 'east-west'
          ? [
              { name: 'West Coast', color: '#2563eb', pts: geocoded.filter((a) => (a.lng as number) <= SPLIT_LNG) },
              { name: 'East Coast', color: '#dc2626', pts: geocoded.filter((a) => (a.lng as number) >  SPLIT_LNG) },
            ].filter((g) => g.pts.length > 0)
          : [{ name: 'Optimized Route', color: '#2563eb', pts: geocoded }];

      const newTechs: Technician[]  = [];
      const newRoutes: Route[]      = [];
      const newGroups: RouteGroup[] = [];

      for (const g of raw) {
        const ordered = nearestNeighbor(g.pts);
        const dist    = routeDist(ordered);
        const tech: Technician = { id: uuid(), name: g.name, color: g.color };
        const route: Route = {
          id: uuid(),
          technicianId: tech.id,
          country: 'US',
          stops: ordered.map((a, i) => ({ addressId: a.id, sequence: i })),
          totalDistanceMeters: dist * 1609.344,
          totalDurationSeconds: (dist / 50) * 3600,
        };
        newTechs.push(tech);
        newRoutes.push(route);
        newGroups.push({ tech, addrs: ordered, dist, route });
      }

      setTechs(newTechs);
      setRoutes(newRoutes);
      setGroups(newGroups);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv(g: RouteGroup) {
    const rows = [
      ['Stop #', 'Name', 'Address', 'Lat', 'Lng', 'Miles from prev'].join(','),
      ...g.addrs.map((a, i) => {
        const d = i === 0 ? '' : haversine(g.addrs[i-1].lat!, g.addrs[i-1].lng!, a.lat!, a.lng!).toFixed(2);
        return [i + 1, `"${a.name || a.storeNumber || ''}"`, `"${a.fullAddress}"`, a.lat, a.lng, d].join(',');
      }),
    ].join('\n');
    const el = document.createElement('a');
    el.href = URL.createObjectURL(new Blob([rows], { type: 'text/csv' }));
    el.download = `${g.tech.name.replace(/\s+/g, '_')}_route.csv`;
    el.click();
  }

  const hasResults = groups.length > 0;

  return (
    <div className="p-6 space-y-4">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Routes &amp; Export</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {geocoded.length} geocoded stop{geocoded.length !== 1 ? 's' : ''}
            {addresses.length > geocoded.length
              ? ` · ${addresses.length - geocoded.length} pending geocode`
              : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Mode selector */}
          <div className="flex rounded-lg overflow-hidden border border-slate-600 text-sm">
            {(['single', 'east-west'] as SplitMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setSplitMode(v)}
                className={`px-4 py-2 font-medium transition-colors ${
                  splitMode === v
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {v === 'single' ? 'Single Route' : 'East / West Split'}
              </button>
            ))}
          </div>
          <button
            className="btn-primary"
            disabled={busy || geocoded.length === 0}
            onClick={optimize}
          >
            {busy ? 'Optimizing…' : '⚡ Optimize'}
          </button>
        </div>
      </div>

      {/* Empty state */}
      {geocoded.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-slate-500 text-sm font-medium">No geocoded addresses yet.</p>
          <p className="text-slate-400 text-xs mt-1">
            Go to <strong>Import</strong>, upload your list, then click <strong>Geocode all</strong>.
          </p>
        </div>
      )}

      {error && (
        <div className="card p-4 bg-rose-50 border-rose-300 text-rose-900 text-sm">{error}</div>
      )}

      {/* Map + results */}
      {geocoded.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">

          {/* Map */}
          <div className="card overflow-hidden" style={{ height: 560 }}>
            <MapView
              addresses={addresses}
              technicians={hasResults ? techs : []}
              routes={hasResults ? routes : []}
              fitBounds
            />
          </div>

          {/* Sidebar */}
          <div className="card p-4 overflow-auto" style={{ maxHeight: 560 }}>
            {!hasResults ? (
              <div className="h-full flex items-center justify-center text-center px-4">
                <div>
                  <p className="text-slate-600 font-medium text-sm mb-2">Choose a mode, then click Optimize</p>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    <strong>Single Route</strong> — orders all stops by shortest driving distance.<br /><br />
                    <strong>East / West Split</strong> — splits your list at the 100th meridian
                    (roughly the center of the US), then optimizes each half independently.
                    Great when you have stops on both coasts.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {groups.map((g, gi) => (
                  <div key={g.tech.id}>
                    {gi > 0 && <hr className="border-slate-200 mb-4" />}
                    {/* Group header */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ background: g.tech.color }} />
                        <span className="font-semibold text-sm">{g.tech.name}</span>
                        <span className="badge">{g.addrs.length} stops</span>
                      </div>
                      <button className="btn-ghost text-xs py-1 px-2" onClick={() => exportCsv(g)}>
                        Export CSV
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">
                      <strong>{g.dist.toFixed(1)} mi</strong> total ·{' '}
                      est. <strong>{Math.round(g.dist / 50 * 60)} min</strong> driving
                    </p>
                    {/* Stop list */}
                    <div className="space-y-1.5 max-h-72 overflow-auto pr-1">
                      {g.addrs.map((a, i) => {
                        const d = i === 0
                          ? null
                          : haversine(g.addrs[i-1].lat!, g.addrs[i-1].lng!, a.lat!, a.lng!);
                        return (
                          <div key={a.id} className="flex gap-2 items-start text-xs">
                            <span
                              className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-white font-bold mt-0.5"
                              style={{ fontSize: 9, background: g.tech.color }}
                            >
                              {i + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate">
                                {a.name || a.storeNumber || `Stop ${i + 1}`}
                              </div>
                              <div className="text-slate-500 truncate">{a.fullAddress}</div>
                              {d !== null && (
                                <div className="text-slate-400">{d.toFixed(1)} mi from prev</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
