import { useApp } from '@/lib/store';

export default function SettingsPage() {
  const { addresses, technicians, routes, reset } = useApp();

  function clearAll() {
    if (confirm('This will clear all imported addresses and routes. Continue?')) {
      reset();
    }
  }

  return (
    <div className="p-6 space-y-4 max-w-xl">
      <h1 className="text-2xl font-semibold text-white">Settings</h1>

      {/* Data summary */}
      <div className="card p-5 space-y-3">
        <div className="text-sm font-medium">Current session data</div>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: 'Addresses', value: addresses.length },
            { label: 'Geocoded',  value: addresses.filter(a => a.geocodeStatus === 'matched').length },
            { label: 'Routes',    value: routes.length },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-50 rounded-lg py-3">
              <div className="text-2xl font-bold text-slate-800">{value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Data lives in your browser's memory for this session only. Export your routes as CSV before closing the tab.
        </p>
      </div>

      {/* Clear data */}
      <div className="card p-5 space-y-2">
        <div className="text-sm font-medium">Clear session data</div>
        <p className="text-xs text-slate-500">
          Removes all imported addresses and computed routes. You'll need to re-import and re-geocode.
        </p>
        <button className="btn-danger mt-1" onClick={clearAll}>
          Clear all data
        </button>
      </div>

      {/* About */}
      <div className="card p-5 space-y-1">
        <div className="text-sm font-medium">About</div>
        <p className="text-xs text-slate-500">
          <strong>PMO Route Optimizer v0.1</strong><br />
          Geocoding by U.S. Census Bureau (free, no API key).<br />
          Fallback geocoding by OpenStreetMap Nominatim.<br />
          Route optimization uses nearest-neighbor algorithm.<br />
          No data is sent to any server — everything runs in your browser.
        </p>
      </div>
    </div>
  );
}
