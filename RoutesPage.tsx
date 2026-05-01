import { useState } from 'react';
import { useApp } from '@/lib/store';
import MapView from '@/components/MapView';
import { computeAllRoutes } from '@/lib/orchestrator';
import { exportXlsx, exportTechnicianXlsx, exportTechnicianCsv } from '@/lib/exporter';

export default function RoutesPage() {
  const { addresses, technicians, assignment, routes, setRoutes } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeDirections, setIncludeDirections] = useState(true);
  const [directionsByRoute, setDirectionsByRoute] = useState<Map<string, string[]>>(new Map());
  const [geometryByRoute, setGeometryByRoute] = useState<Map<string, string>>(new Map());

  async function optimize() {
    setError(null);
    setBusy('Computing distance matrix and optimizing...');
    try {
      const result = await computeAllRoutes(technicians, addresses, assignment, {
        withDirections: includeDirections,
        onProgress: (n) => setBusy(`Optimizing ${n}...`),
      });
      setRoutes(result.routes);
      setDirectionsByRoute(result.directionsByRoute);
      setGeometryByRoute(result.geometryByRoute);
      if (result.errors.length) {
        setError(result.errors.map((e) => `${e.technicianId}: ${e.message}`).join('\n'));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function exportAll() {
    exportXlsx(routes, technicians, addresses, includeDirections ? directionsByRoute : null, {
      filename: 'routes',
      includeDirections,
    });
  }

  function exportOne(techId: string, format: 'xlsx' | 'csv') {
    const tech = technicians.find((t) => t.id === techId);
    if (!tech) return;
    // A tech may have multiple routes (one per country) — gather them all.
    const techRoutes = routes.filter((r) => r.technicianId === techId);
    if (techRoutes.length === 0) return;
    if (format === 'xlsx') {
      exportTechnicianXlsx(techRoutes, tech, addresses, includeDirections ? directionsByRoute : null);
    } else {
      exportTechnicianCsv(techRoutes, tech, addresses);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Routes & Export</h1>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeDirections} onChange={(e) => setIncludeDirections(e.target.checked)} />
            Include turn-by-turn directions
          </label>
          <button className="btn-primary" disabled={!!busy || technicians.length === 0} onClick={optimize}>
            {busy ?? 'Optimize routes'}
          </button>
          <button className="btn-ghost" disabled={routes.length === 0} onClick={exportAll}>Export all (.xlsx)</button>
        </div>
      </div>

      {error && <div className="card p-4 border-rose-300 bg-rose-50 text-sm text-rose-900 whitespace-pre">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
        <div className="card overflow-hidden h-[560px]">
          <MapView
            addresses={addresses}
            technicians={technicians}
            routes={routes}
            geometryByRoute={geometryByRoute}
          />
        </div>
        <div className="card p-4 space-y-3 max-h-[560px] overflow-auto">
          <div className="text-sm font-medium">Per-technician export</div>
          {routes.length === 0 && <div className="text-sm text-slate-500">Optimize first to see routes here.</div>}
          {routes.map((r) => {
            const tech = technicians.find((t) => t.id === r.technicianId);
            const legs = Math.max(0, r.stops.length - 1);
            const totalMi = r.totalDistanceMeters / 1609.344;
            const totalHr = r.totalDurationSeconds / 3600;
            const avgMi = legs > 0 ? totalMi / legs : 0;
            const avgMin = legs > 0 ? (r.totalDurationSeconds / 60) / legs : 0;
            return (
              <div key={r.id} className="p-3 border rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full" style={{ background: tech?.color }} />
                    <div className="text-sm font-medium">{tech?.name}</div>
                    {r.country !== 'US' && (
                      <span className="badge bg-indigo-100 text-indigo-800" title="International route — computed separately from US stops">
                        {r.country}
                      </span>
                    )}
                  </div>
                  <span className="badge">{r.stops.length} stops</span>
                </div>
                <div className="text-xs text-slate-600 mb-1">
                  <strong>{totalMi.toFixed(1)} mi</strong> total · <strong>{totalHr.toFixed(1)} h</strong> total
                </div>
                <div className="text-xs text-slate-500 mb-2">
                  Avg between stops: {avgMi.toFixed(1)} mi · {avgMin.toFixed(0)} min
                </div>
                <div className="flex gap-2">
                  <button className="btn-ghost text-xs" onClick={() => exportOne(r.technicianId, 'xlsx')}>Their .xlsx</button>
                  <button className="btn-ghost text-xs" onClick={() => exportOne(r.technicianId, 'csv')}>Their .csv</button>
                </div>
                {includeDirections && directionsByRoute.has(r.id) && (
                  <details className="mt-2">
                    <summary className="text-xs cursor-pointer text-slate-600">Turn-by-turn ({directionsByRoute.get(r.id)!.length} steps)</summary>
                    <ol className="text-xs list-decimal pl-5 mt-2 space-y-0.5 max-h-48 overflow-auto">
                      {directionsByRoute.get(r.id)!.map((s, i) => <li key={i}>{s}</li>)}
                    </ol>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
