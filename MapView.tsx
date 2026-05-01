import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Address, Route, Technician } from '@/types';
import { decodePolyline } from '@/lib/osrm';

// Fix default Leaflet marker icons (Vite doesn't include them automatically).
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

function makeColoredIcon(color: string, label: string | number, intl = false): L.DivIcon {
  // International stops use a square marker so they read as visually distinct
  // even when they share a technician color with a nearby US stop.
  const radius = intl ? '4px' : '50%';
  const border = intl ? '2px dashed white' : '2px solid white';
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};color:white;border-radius:${radius};width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;border:${border};box-shadow:0 1px 3px rgba(0,0,0,.3)">${label}</div>`,
    iconSize: [26, 26], iconAnchor: [13, 13],
  });
}

interface Props {
  addresses: Address[];
  technicians: Technician[];
  routes: Route[];
  geometryByRoute?: Map<string, string>;
  fitBounds?: boolean;
}

function FitBounds({ addresses }: { addresses: Address[] }) {
  const map = useMap();
  useEffect(() => {
    const pts = addresses.filter((a) => a.lat !== null && a.lng !== null);
    if (pts.length === 0) return;
    const bounds = L.latLngBounds(pts.map((a) => [a.lat as number, a.lng as number]));
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [addresses, map]);
  return null;
}

export default function MapView({ addresses, technicians, routes, geometryByRoute, fitBounds = true }: Props) {
  const techMap = useMemo(() => new Map(technicians.map((t) => [t.id, t])), [technicians]);
  const stopOrderById = useMemo(() => {
    const m = new Map<string, { color: string; label: number }>();
    for (const r of routes) {
      const tech = techMap.get(r.technicianId);
      const color = tech?.color ?? '#475569';
      r.stops.forEach((s, i) => m.set(s.addressId, { color, label: i + 1 }));
    }
    return m;
  }, [routes, techMap]);

  const polylines = useMemo(() => {
    if (!geometryByRoute) return [] as { color: string; positions: [number, number][] }[];
    const out: { color: string; positions: [number, number][] }[] = [];
    routes.forEach((r) => {
      const geom = geometryByRoute.get(r.id);
      if (!geom) return;
      const tech = techMap.get(r.technicianId);
      out.push({ color: tech?.color ?? '#475569', positions: decodePolyline(geom) });
    });
    return out;
  }, [routes, geometryByRoute, techMap]);

  return (
    <MapContainer center={[39.5, -98.35]} zoom={4} className="h-full w-full rounded-xl overflow-hidden">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {fitBounds && <FitBounds addresses={addresses} />}

      {polylines.map((p, i) => (
        <Polyline key={i} positions={p.positions} pathOptions={{ color: p.color, weight: 4, opacity: 0.85 }} />
      ))}

      {addresses.map((a) => {
        if (a.lat === null || a.lng === null) return null;
        const meta = stopOrderById.get(a.id);
        const icon = meta
          ? makeColoredIcon(meta.color, meta.label, a.isInternational)
          : (a.isInternational ? makeColoredIcon('#7c3aed', '·', true) : defaultIcon);
        return (
          <Marker key={a.id} position={[a.lat, a.lng]} icon={icon}>
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">{a.name || `Store ${a.storeNumber ?? ''}`}</div>
                <div className="text-slate-600">{a.fullAddress}</div>
                <div className="mt-1 text-xs">
                  {meta && <>Stop #{meta.label} · </>}
                  <span className={a.isInternational ? 'text-indigo-700 font-medium' : ''}>{a.country}</span>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
