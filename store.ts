import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface Address {
  id: string;
  raw: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number | null;
  lng?: number | null;
  geocodeStatus: 'pending' | 'geocoded' | 'failed';
  [key: string]: unknown;
}

export interface Technician {
  id: string;
  name: string;
  color: string;
}

export interface RouteStop {
  addressId: string;
  order: number;
}

export interface Route {
  id: string;
  technicianId: string;
  stops: RouteStop[];
  day?: number;
}

interface AppState {
  addresses: Address[];
  technicians: Technician[];
  routes: Route[];
  splitStrategy: 'single' | 'east-west';
  columnMapping: Record<string, string>;
  setAddresses: (addresses: Address[]) => void;
  upsertAddresses: (addresses: Address[]) => void;
  setTechnicians: (technicians: Technician[]) => void;
  addTechnician: (technician: Technician) => void;
  removeTechnician: (id: string) => void;
  setRoutes: (routes: Route[]) => void;
  setSplitStrategy: (strategy: 'single' | 'east-west') => void;
  setColumnMapping: (mapping: Record<string, string>) => void;
  reset: () => void;
}

const initialState = {
  addresses: [] as Address[],
  technicians: [] as Technician[],
  routes: [] as Route[],
  splitStrategy: 'single' as const,
  columnMapping: {} as Record<string, string>,
};

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      ...initialState,
      setAddresses: (addresses) => set({ addresses }),
      upsertAddresses: (incoming) =>
        set((state) => {
          const map = new Map(state.addresses.map((a) => [a.id, a]));
          for (const a of incoming) map.set(a.id, a);
          return { addresses: Array.from(map.values()) };
        }),
      setTechnicians: (technicians) => set({ technicians }),
      addTechnician: (technician) =>
        set((state) => ({ technicians: [...state.technicians, technician] })),
      removeTechnician: (id) =>
        set((state) => ({
          technicians: state.technicians.filter((t) => t.id !== id),
        })),
      setRoutes: (routes) => set({ routes }),
      setSplitStrategy: (splitStrategy) => set({ splitStrategy }),
      setColumnMapping: (columnMapping) => set({ columnMapping }),
      reset: () => set(initialState),
    }),
    {
      name: 'routemap-session',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
