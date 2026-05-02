// MapView.tsx

import { useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useApp } from './store';
import type { Address } from './store';

// Haversine for pin spacing
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; 
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const STATUS_COLORS: Record<string, string> = {
  geocoded: '#10b981',
  pending: '#f59e0b',
  failed: '#ef4444',
};

// Create a cluster of addresses
interface Cluster {
  lat: number;
  lng: number;
  addresses: Address[];
  density: number;
  dominantField?: string; // For territory shading
}

function clusterAddresses(addresses: Address[], zoom: number): Cluster[] {
  const radius = zoom >= 14 ? 0.001 : zoom >= 12 ? 0.005 : zoom >= 10 ? 0.02 : zoom >= 8 ? 0.08 : 0.3;
  const clusters: Cluster[] = [];
  const used = new Set<number>();

  for (let i = 0; i < addresses.length; i++) {
    if (used.has(i)) continue;
    const a = addresses[i];
    if (a.lat == null || a.lng == null) continue;
    
    const cluster: Cluster = { lat: a.lat, lng: a.lng, addresses: [a], density: 1, dominantField: '' };
    used.add(i);
    
    // Accumulate density and dominant fields
    for (let j = i + 1; j < addresses.length; j++) {
      if (used.has(j)) continue;
      const b = addresses[j];
      if (b.lat == null || b.lng == null) continue;
      
      // Simple distance check
      const dist = getDistance(a.lat, a.lng, b.lat, b.lng);
      if (dist < radius * 111.12) { // Approx km conversion
        cluster.addresses.push(b);
        used.add(j);
      }
    }
    cluster.density = cluster.addresses.length;
    clusters.push(cluster);
  }
  return clusters;
}

// Color helper based on a field
function getGroupColor(addr: Address, field: string): string {
  const val = addr[field as keyof Address] as string;
  // Simple hash function for consistent colors
  let hash = 0;
  for (let i = 0; i < (val || 'unknown').length; i++) {
    hash = val.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = hash % 360;
  return `hsl(${h}, 70%, 50%)`;
}

export interface MapViewProps {
  addresses: Address[];
  technicians?: Technician[];
  routes?: Route[];
  filterStatus?: string;
  filterState?: string;
  mapMode: 'pins' | 'density' | 'territory';
  colorField?: string;
}

interface Cluster {
  lat: number;
  lng: number;
  addresses: Address[];
  density: number;
  dominantField?: string;
}

function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  
  map.on('zoomend', () => {
    const z = map.getZoom();
    setZoom(z);
    onZoom(z);
  });
  
  return <></>;
}

export default function MapView({
  addresses,
  technicians = [],
  routes = [],
  filterStatus,
  filterState,
  mapMode,
  colorField,
}: MapViewProps) {
  const [zoom, setZoom] = useState(5);
  const [radiusAddr, setRadiusAddr] = useState<Address | null>(null);
  const [radiusMiles, setRadiusMiles] = useState(10);
  
  const geocoded = addresses.filter(
    (a) => a.lat != null && a.lng != null && isFinite(a.lat as number) && isFinite(a.lng as number)
  );
  
  const addrColor = new Map<string, string>();
  if (routes.length > 0) {
    routes.forEach((r, ri) => {
      const color = technicians.find((t) => t.id === r.technicianId)?.color ?? '#3b82f6';
      r.stops.forEach((s) => addrColor.set(s.addressId, color));
    });
  }
  
  const isVisible = (a: Address) => {
    if (filterStatus && filterStatus !== 'all' && a.geocodeStatus !== filterStatus) return false;
    if (filterState && filterState !== 'all' && a.state !== filterState) return false;
    return true;
  };

  const filtered = useMemo(() => geocoded.filter(isVisible), [geocoded, filterStatus, filterState]);
  
  // Build clusters for Heat Map / Territory
  const clusters = useMemo(() => (mapMode === 'density' || mapMode === 'territory') ? clusterAddresses(filtered, zoom) : [], [filtered, mapMode, zoom]);

  return (
    <MapContainer center={[39.8283, -98.5795]} zoom={zoom} className="h-full w-full" zoomControl={false}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <ZoomWatcher onZoom={setZoom} />
      
      {/* ── Density Map / Territory Shading ── */}
      {(mapMode === 'density' || mapMode === 'territory') && clusters.map((c, ci) => {
        const minDensity = 1;
        const maxDensity = Math.max(...clusters.map(x => x.density), 1);
        const intensity = (c.density - minDensity) / (maxDensity - minDensity);
        
        // Color logic
        let color = '#3b82f6'; // Default Blue
        let fillColor = '#3
