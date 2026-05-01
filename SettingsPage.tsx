import { useApp } from './store';

export default function SettingsPage() {
  const { addresses, routes, reset } = useApp();

  const geocodedCount = addresses.filter((a) => a.geocodeStatus === 'geocoded').length;

  const handleExportSession = () => {
    const data = {
      addresses,
      routes,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `routemap-session-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportSession = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          if (data.addresses) {
            useApp.setState({ addresses: data.addresses });
          }
          if (data.routes) {
            useApp.setState({ routes: data.routes });
          }
          alert('Session imported successfully.');
        } catch {
          alert('Failed to import session: invalid JSON.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleClearData = () => {
    if (confirm('Clear all addresses and routes? This cannot be undone.')) {
      reset();
    }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Settings</h1>

      {/* Data Summary */}
      <div className="card p-4 space-y-3">
        <h2 className="font-semibold text-slate-700">Current Session</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-slate-800">{addresses.length}</p>
            <p className="text-xs text-slate-500">Addresses</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{geocodedCount}</p>
            <p className="text-xs text-slate-500">Geocoded</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{routes.length}</p>
            <p className="text-xs text-slate-500">Routes</p>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Data is automatically saved in your browser and will persist across sessions.
        </p>
      </div>

      {/* Session Management */}
      <div className="card p-4 space-y-3">
        <h2 className="font-semibold text-slate-700">Session Management</h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={handleExportSession}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export Session
          </button>
          <button className="btn-ghost" onClick={handleImportSession}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Import Session
          </button>
          <button className="btn-danger" onClick={handleClearData}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Clear All Data
          </button>
        </div>
      </div>

      {/* About */}
      <div className="card p-4 space-y-2">
        <h2 className="font-semibold text-slate-700">About RouteMap</h2>
        <p className="text-sm text-slate-500">
          RouteMap is a free, browser-based route optimizer. All data is processed locally in your browser — nothing is sent to external servers except geocoding requests to the U.S. Census Bureau and OpenStreetMap Nominatim.
        </p>
        <ul className="text-sm text-slate-500 space-y-1 mt-2">
          <li>• Geocoding: U.S. Census Bureau (primary) + Nominatim (fallback)</li>
          <li>• Routing: Nearest-neighbor TSP algorithm</li>
          <li>• Maps: OpenStreetMap via Leaflet</li>
          <li>• No account or login required</li>
        </ul>
      </div>
    </div>
  );
}
