import { useApp } from '@/lib/store';
import MapView from '@/components/MapView';
import StatsPanel from '@/components/StatsPanel';
import { Link } from 'react-router-dom';

export default function DashboardPage() {
  const { addresses, technicians, routes } = useApp();
  const empty = addresses.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-500">
            {empty ? 'Get started by importing a list of addresses.' : `${addresses.length.toLocaleString()} stops · ${technicians.length} technicians · ${routes.length} routes`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/import" className="btn-primary">Import Addresses</Link>
          <Link to="/routes" className="btn-ghost">Build Routes</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <div className="card overflow-hidden h-[520px]">
          {empty ? (
            <div className="h-full flex items-center justify-center text-slate-400">
              Import addresses to see them on the map.
            </div>
          ) : (
            <MapView addresses={addresses} technicians={technicians} routes={routes} />
          )}
        </div>
        <div className="card p-4 space-y-2">
          <div className="text-sm font-medium">Quick start</div>
          <ol className="list-decimal pl-5 text-sm text-slate-700 space-y-1">
            <li><Link className="text-brand-600 hover:underline" to="/import">Import</Link> a spreadsheet (.xlsx, .csv) or a Google Sheets URL.</li>
            <li>Click <strong>Geocode</strong> to convert addresses to map points (Census, free).</li>
            <li><Link className="text-brand-600 hover:underline" to="/technicians">Add technicians</Link> and pick a split strategy.</li>
            <li><Link className="text-brand-600 hover:underline" to="/routes">Optimize</Link> and export per-technician sheets.</li>
          </ol>
        </div>
      </div>

      {!empty && (
        <StatsPanel addresses={addresses} technicians={technicians} routes={routes} />
      )}
    </div>
  );
}
