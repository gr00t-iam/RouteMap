// RoutesPage.tsx (Partial updates)

// Haversine distance function (in miles)
function haversine(a: Address, b: Address): number {
  const R = 3958.8;
  const dLat = ((b.lat! - a.lat!) * Math.PI) / 180;
  const dLng = ((b.lng! - a.lng!) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos((a.lat! * Math.PI) / 180) * Math.cos((b.lat! * Math.PI) / 180) * sinLng * sinLng;
  return R * 2 * Math.asin(Math.sqrt(h));
}

export default function RoutesPage() {
  const { addresses, technicians, routes, setRoutes } = useApp();
  const [optimized, setOptimized] = useState(false);
  const [groups, setGroups] = useState<RouteGroup[]>([]);

  // ... existing optimize logic ...

  return (
    <div className="flex-1 overflow-auto p-4 bg-slate-50">
      {/* ... Header ... */}
      
      {optimized && groups.map((group) => {
        // 2. Calculate average distance between stops
        const segments = group.addresses
          .map((addr, i) => i > 0 ? haversine(group.addresses[i - 1], addr) : 0)
          .slice(1); // Remove the first 0
        
        const totalDist = segments.reduce((sum, dist) => sum + dist, 0);
        const avgDist = segments.length > 0 ? totalDist / segments.length : 0;

        return (
          <div key={group.techId} className="card overflow-hidden mb-4">
            {/* ... Technician Header ... */}
            
            {/* ... Existing table ... */}
            <table className="w-full text-sm">
              <thead>...</thead>
              <tbody>
                {group.addresses.map((a, i) => (
                  <tr key={a.id}>
                    <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                    {/* ... other cells ... */}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 3. Display Average Distance Metric */}
            <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex justify-between items-center">
              <div className="text-sm">
                <span className="text-slate-500">Total Route Distance:</span>
                <span className="font-bold text-slate-800 ml-1">{totalDist.toFixed(1)} mi</span>
              </div>
              <div className="text-sm">
                <span className="text-slate-500">Avg. Stop-to-Stop:</span>
                <span className="font-bold text-blue-600 ml-1">{avgDist.toFixed(1)} mi</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
