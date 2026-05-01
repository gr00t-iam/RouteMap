// Shared type definitions for the Route Optimizer.

export type GeocodeStatus = 'pending' | 'matched' | 'unmatched' | 'failed';

export interface RawAddressRow {
  // What we get from the imported spreadsheet. Field names are best-effort.
  stopNumber?: string | number;   // "Stop #" / "Stop Number"
  storeNumber?: string | number;  // "Store #" / "Store Number"
  name?: string;                  // Optional location name
  street?: string;                // "Street" / "Address" / "Address 1"
  city?: string;
  state?: string;
  zip?: string | number;
  country?: string;               // "Country" — defaults to "US" if blank
  oneLine?: string;               // If a single "Full Address" column was used
  notes?: string;
}

export interface Address {
  id: string;                     // uuid (client-generated until persisted)
  projectId?: string;
  stopNumber: string | null;
  storeNumber: string | null;
  name: string | null;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;                // ISO-ish 2-letter ("US", "CA", "MX", "GB", ...) — normalized at import.
  isInternational: boolean;       // true when country !== "US"
  fullAddress: string;            // The string we send to the geocoder
  lat: number | null;
  lng: number | null;
  geocodeStatus: GeocodeStatus;
  geocodeSource?: 'census' | 'nominatim';  // Which engine produced the match.
  geocodeMessage?: string;        // Error / partial-match details
  notes?: string;
}

export interface Technician {
  id: string;
  projectId?: string;
  name: string;
  color: string;                  // For map polylines
  email?: string;
  startLat?: number;              // Optional depot / start point
  startLng?: number;
  endLat?: number;                // Optional end point (defaults to start)
  endLng?: number;
}

export interface RouteStop {
  addressId: string;
  order: number;                  // 0-based stop order on the route
  legDistanceMeters?: number;     // From previous stop
  legDurationSeconds?: number;
}

export interface Route {
  id: string;
  projectId?: string;
  technicianId: string;
  country: string;                // "US" or non-US country code; international routes are computed separately
  stops: RouteStop[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  computedAt: string;             // ISO timestamp
}

export interface Project {
  id: string;
  orgId?: string;
  name: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type SplitStrategy = 'equal' | 'geographic' | 'manual' | 'mixed';
