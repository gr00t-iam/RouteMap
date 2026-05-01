import { Link, NavLink, Route, Routes } from 'react-router-dom';
import DashboardPage from '@/pages/DashboardPage';
import ImportPage from '@/pages/ImportPage';
import TechniciansPage from '@/pages/TechniciansPage';
import RoutesPage from '@/pages/RoutesPage';
import SettingsPage from '@/pages/SettingsPage';
import { isSupabaseConfigured } from '@/lib/supabase';

const nav = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/import', label: 'Import' },
  { to: '/technicians', label: 'Technicians' },
  { to: '/routes', label: 'Routes & Export' },
  { to: '/settings', label: 'Settings' },
];

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="inline-block w-7 h-7 rounded bg-brand-500" />
            <span className="font-semibold tracking-tight">PMO Route Optimizer</span>
          </Link>
          <nav className="flex items-center gap-1">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm ${isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="text-xs text-slate-500">
            {isSupabaseConfigured() ? <span className="badge">Supabase ready</span> : <span className="badge">Local-only mode</span>}
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/technicians" element={<TechniciansPage />} />
          <Route path="/routes" element={<RoutesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
      <footer className="border-t border-slate-200 bg-white text-xs text-slate-500">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex justify-between">
          <span>Geocoding by U.S. Census Bureau. Routing by OSRM. Map data &copy; OpenStreetMap contributors.</span>
          <span>v0.1</span>
        </div>
      </footer>
    </div>
  );
}
