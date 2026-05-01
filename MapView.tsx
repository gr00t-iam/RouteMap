import { useEffect, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Address, Technician, Route } from './store';

// Fix default marker icon paths for Vite/webpack
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function makeIcon(color: string, opacity = 1) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24C24 5.37 18.63 0 12 0z"
      fill="${color}" fill-opacity="${opacity}" stroke="#fff" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="4" fill="#fff" fill-opacity="${opacity}"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -36],
    className: '',
  });
}

function makeClusterIcon(count: number) {
  const size = count > 99 ? 44 : count > 9 ? 38 : 32;
  return L.divIcon({
    html: `<div style="background:#3b82f6;color:#fff;border-radius:50%;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    className: '',
  });
}

const STATUS_COLORS: Record<string, string> = {
  geocoded: '#22c55e',
  pending: '#f59e0b',
  failed: '#ef4444',
};

const ROUTE_COLORS = [
  '#3b82f6','#f97316','#a855f7','#10b981','#ec4899','#f59e0b','#6366f1','#14b8a6',
];

interface Cluster {
  lat: number;
  lng: number;
  addresses: Address[];
}

function clusterAddresses(addresses: Address[], zoom: number): Cluster[] {
  const radius = zoom >= 14 ? 0.001 : zoom >= 12 ? 0.005 : zoom >= 10 ? 0.02 : zoom >= 8 ? 0.08 : 0.3;
  const clusters: Cluster[] = [];
  const used = new Set<number>();
  for (let i = 0; i < addresses.length; i++) {
    if (used.has(i)) continue;
    const a = addresses[i];
    if (a.lat == null || a.lng == null) continue;
    const cluster: Cluster = { lat: a.lat!, lng: a.lng!, addresses: [a] };
    used.add(i);
    for (let j = i + 1; j < addresses.length; j++) {
      if (used.has(j)) continue;
      const b = addresses[j];
      if (b.lat == null || b.lng == null) continue;
      const dlat = Math.abs(a.lat! - b.lat!);
      const dlng = Math.abs(a.lng! - b.lng!);
      if (dlat < radius && dlng < radius) {
        cluster.addresses.push(b);
        used.add(j);
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap();
  useEffect(() => {
    onZoom(map.getZoom());
    map.on('zoomend', () => onZoom(map.getZoom()));
    return () => { map.off('zoomend'); };
  }, [map, onZoom]);
  return null;
}

function FitBounds({ addresses }: { addresses: Address[] }) {
  const map = useMap();
  const fittedRef = useRef(false);
  useEffect(() => {
    if (fittedRef.current) return;
    const pts = addresses.filter((a) => a.lat != null && a.lng != null && isFinite(a.lat!) && isFinite(a.lng!));
    if (pts.length === 0) return;
    fittedRef.current = true;
    try {
      const bounds = L.latLngBounds(pts.map((a) => [a.lat!, a.lng!] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    } catch { /* ignore */ }
  }, [addresses, map]);
  return null;
}

export interface MapViewProps {
  addresses: Address[];
  technicians?: Technician[];
  routes?: Route[];
  filterStatus?: string;
  filterState?: string;
  showHeatmap?: boolean;
}

export default function MapView({
  addresses,
  technicians = [],
  routes = [],
  filterStatus,
  filterState,
  showHeatmap = false,
}: MapViewProps) {
  const [zoom, setZoom] = useState(5);
  const [radiusAddr, setRadiusAddr] = useState<Address | null>(null);
  const [radiusMiles, setRadiusMiles] = useState(10);

  const geocoded = addresses.filter(
    (a) => a.lat != null && a.lng != null && isFinite(a.lat as number) && isFinite(a.lng as number)
  );

  // Build address→route color map
  const addrColor = new Map<string, string>();
  if (routes.length > 0) {
    routes.forEach((r, ri) => {
      const color = technicians.find((t) => t.id === r.technicianId)?.color ?? ROUTE_COLORS[ri % ROUTE_COLORS.length];
      r.stops.forEach((s) => addrColor.set(s.addressId, color));
    });
  }

  // Filter logic
  const isVisible = (a: Address) => {
    if (filterStatus && filterStatus !== 'all' && a.geocodeStatus !== filterStatus) return false;
    if (filterState && filterState !== 'all' && (a.state || '') !== filterState) return false;
    return true;
  };

  const visibleAddresses = geocoded.filter(isVisible);
  const dimmedAddresses = geocoded.filter((a) => !isVisible(a));

  const clusters = clusterAddresses(visibleAddresses, zoom);
  const dimmedClusters = clusterAddresses(dimmedAddresses, zoom);

  if (geocoded.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-100 rounded-xl text-slate-400 text-sm">
        No geocoded addresses to display
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {radiusAddr && (
        <div className="absolute top-2 right-2 z-[1000] bg-white rounded-lg shadow-md p-2 flex items-center gap-2 text-sm">
          <label className="text-slate-600">Radius (mi):</label>
          <input
            type="number"
            min={1}
            max={500}
            value={radiusMiles}
            onChange={(e) => setRadiusMiles(Number(e.target.value))}
            className="w-16 border border-slate-300 rounded px-2 py-1 text-sm"
          />
          <button
            onClick={() => setRadiusAddr(null)}
            className="text-slate-400 hover:text-slate-700 font-bold"
          >✕</button>
        </div>
      )}

      <MapContainer
        center={[39.5, -98.35]}
        zoom={4}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <FitBounds addresses={geocoded} />
        <ZoomWatcher onZoom={setZoom} />

        {/* Heatmap layer: density circles */}
        {showHeatmap && geocoded.map((a) => (
          <Circle
            key={`heat-${a.id}`}
            center={[a.lat!, a.lng!]}
            radius={3000}
            pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.08, weight: 0 }}
          />
        ))}

        {/* Radius circle for selected address */}
        {radiusAddr && radiusAddr.lat != null && radiusAddr.lng != null && (
          <Circle
            center={[radiusAddr.lat!, radiusAddr.lng!]}
            radius={radiusMiles * 1609.34}
            pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.08, weight: 2 }}
          />
        )}

        {/* Dimmed clusters (filtered out) */}
        {dimmedClusters.map((c, ci) => {
          if (c.addresses.length > 1) {
            return (
              <Marker key={`dc-${ci}`} position={[c.lat, c.lng]} icon={makeClusterIcon(c.addresses.length)}
                opacity={0.25} />
            );
          }
          const a = c.addresses[0];
          const color = addrColor.get(a.id) ?? STATUS_COLORS[a.geocodeStatus] ?? '#94a3b8';
          return (
            <Marker key={`dm-${a.id}`} position={[a.lat!, a.lng!]} icon={makeIcon(color, 0.3)} />
          );
        })}

        {/* Visible clusters */}
        {clusters.map((c, ci) => {
          if (c.addresses.length > 1) {
            return (
              <Marker
                key={`cluster-${ci}`}
                position={[c.lat, c.lng]}
                icon={makeClusterIcon(c.addresses.length)}
              >
                <Popup>
                  <strong>{c.addresses.length} stops</strong>
                  <div className="max-h-40 overflow-y-auto mt-1">
                    {c.addresses.map((a) => (
                      <div key={a.id} className="text-xs text-slate-600 py-0.5 border-b border-slate-100">
                        {a.raw || a.street}
                      </div>
                    ))}
                  </div>
                </Popup>
              </Marker>
            );
          }
          const a = c.addresses[0];
          const color = addrColor.get(a.id) ?? STATUS_COLORS[a.geocodeStatus] ?? '#94a3b8';
          const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a.raw || '')}`;
          return (
            <Marker
              key={`pin-${a.id}`}
              position={[a.lat!, a.lng!]}
              icon={makeIcon(color)}
              eventHandlers={{ click: () => setRadiusAddr(a) }}
            >
              <Popup>
                <div className="text-sm min-w-[160px]">
                  <p className="font-semibold">{a.raw || a.street}</p>
                  {a.city && <p className="text-xs text-slate-500">{a.city}, {a.state} {a.zip}</p>}
                  <p className="text-xs mt-1 capitalize text-slate-500">Status: {a.geocodeStatus}</p>
                  <a
                    href={gmaps}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block text-center text-xs bg-blue-500 text-white rounded px-2 py-1 hover:bg-blue-600"
                  >
                    Open in Google Maps
                  </a>
                  <button
                    onClick={() => setRadiusAddr(a)}
                    className="mt-1 block w-full text-center text-xs border border-slate-300 rounded px-2 py-1 hover:bg-slate-100"
                  >
                    Draw radius circle
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
