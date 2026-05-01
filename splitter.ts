// Splits a list of geocoded addresses among multiple technicians.
//
// Strategies match the four modes the user requested:
//   - 'equal'      : round-robin / chunked so every tech gets the same count
//                    (off by 1 for remainders).
//   - 'geographic' : k-means clustering on lat/lng, one cluster per tech.
//                    Best when stops are physically grouped and you want to
//                    minimize cross-territory drives.
//   - 'manual'     : returns an empty assignment — UI handles drag-and-drop.
//   - 'mixed'      : runs 'geographic' as a starting point; UI lets PMO drag
//                    individual stops between techs to adjust.
//
// All functions return a Map<technicianId, addressId[]>.

import type { Address, Technician } from '@/types';

export function splitEqual(addresses: Address[], technicians: Technician[]): Map<string, string[]> {
  const assignment = new Map<string, string[]>(technicians.map((t) => [t.id, []]));
  if (technicians.length === 0) return assignment;
  // Sort by stopNumber if provided, so equal split is at least stable.
  const sorted = addresses.slice().sort((a, b) => {
    const av = Number(a.stopNumber ?? 0), bv = Number(b.stopNumber ?? 0);
    return av - bv;
  });
  sorted.forEach((a, i) => {
    const t = technicians[i % technicians.length];
    assignment.get(t.id)!.push(a.id);
  });
  return assignment;
}

export function splitGeographic(addresses: Address[], technicians: Technician[]): Map<string, string[]> {
  const assignment = new Map<string, string[]>(technicians.map((t) => [t.id, []]));
  if (technicians.length === 0) return assignment;

  // Cluster *within* each country independently. k-means across continents
  // produces nonsense ("North America cluster" lumping a Toronto stop with
  // an LA stop). Within country, the geometry is meaningful.
  const byCountry = new Map<string, Address[]>();
  for (const a of addresses) {
    if (a.lat === null || a.lng === null) continue;
    const c = a.country || 'US';
    if (!byCountry.has(c)) byCountry.set(c, []);
    byCountry.get(c)!.push(a);
  }

  for (const [, group] of byCountry) {
    const points = group.map((a) => ({ id: a.id, lat: a.lat as number, lng: a.lng as number }));
    if (points.length === 0) continue;
    const k = Math.min(technicians.length, points.length);
    const labels = kmeans(points, k, 50);
    for (let i = 0; i < points.length; i++) {
      const techId = technicians[labels[i] % technicians.length].id;
      assignment.get(techId)!.push(points[i].id);
    }
  }

  // Any addresses without coords get round-robined as a fallback.
  const ungeocoded = addresses.filter((a) => a.lat === null || a.lng === null);
  ungeocoded.forEach((a, i) => {
    const t = technicians[i % technicians.length];
    assignment.get(t.id)!.push(a.id);
  });
  return assignment;
}

export function splitManual(_addresses: Address[], technicians: Technician[]): Map<string, string[]> {
  // No automatic assignment; the user will drag stops onto technicians.
  return new Map<string, string[]>(technicians.map((t) => [t.id, []]));
}

export function splitMixed(addresses: Address[], technicians: Technician[]): Map<string, string[]> {
  // Same as geographic; the UI surfaces the assignment as editable.
  return splitGeographic(addresses, technicians);
}

// ---- k-means (simple, lat/lng equirectangular distance) ----

interface Pt { id: string; lat: number; lng: number; }

function kmeans(points: Pt[], k: number, maxIter = 50): number[] {
  // Initial centroids: pick k points spaced through the array (deterministic).
  const centroids: { lat: number; lng: number }[] = [];
  const step = Math.max(1, Math.floor(points.length / k));
  for (let i = 0; i < k; i++) {
    const p = points[Math.min(i * step, points.length - 1)];
    centroids.push({ lat: p.lat, lng: p.lng });
  }
  const labels = new Array<number>(points.length).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    // Assign step
    for (let i = 0; i < points.length; i++) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = haversine(points[i], centroids[c]);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (labels[i] !== best) { labels[i] = best; changed = true; }
    }
    // Update step
    const sums = new Array(k).fill(0).map(() => ({ lat: 0, lng: 0, n: 0 }));
    for (let i = 0; i < points.length; i++) {
      const s = sums[labels[i]];
      s.lat += points[i].lat; s.lng += points[i].lng; s.n++;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c].n > 0) {
        centroids[c].lat = sums[c].lat / sums[c].n;
        centroids[c].lng = sums[c].lng / sums[c].n;
      }
    }
    if (!changed) break;
  }
  return labels;
}

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  // Approximate; we only need relative distance for k-means.
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180, lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}
