// Global app state via Zustand.
// Holds the in-memory addresses, technicians, and computed routes for the
// active project. UI components subscribe to slices of this store.

import { create } from 'zustand';
import type { Address, Route, SplitStrategy, Technician } from '@/types';
import { uuid } from './uuid';

const TECH_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#ea580c', '#7c3aed',
  '#0891b2', '#db2777', '#059669', '#ca8a04', '#475569',
];

interface AppState {
  projectId: string | null;
  projectName: string;
  addresses: Address[];
  technicians: Technician[];
  routes: Route[];
  splitStrategy: SplitStrategy;
  assignment: Map<string, string[]>; // tech id -> address ids

  setProject: (id: string | null, name: string) => void;
  setAddresses: (a: Address[]) => void;
  upsertAddresses: (a: Address[]) => void;
  setTechnicians: (t: Technician[]) => void;
  addTechnician: (name: string) => Technician;
  removeTechnician: (id: string) => void;
  setSplitStrategy: (s: SplitStrategy) => void;
  setAssignment: (a: Map<string, string[]>) => void;
  moveStop: (addressId: string, toTechId: string) => void;
  setRoutes: (r: Route[]) => void;
  reset: () => void;
}

export const useApp = create<AppState>((set, get) => ({
  projectId: null,
  projectName: 'New Project',
  addresses: [],
  technicians: [],
  routes: [],
  splitStrategy: 'equal',
  assignment: new Map(),

  setProject: (id, name) => set({ projectId: id, projectName: name }),
  setAddresses: (addresses) => set({ addresses }),
  upsertAddresses: (incoming) => set((s) => {
    const map = new Map(s.addresses.map((a) => [a.id, a]));
    for (const a of incoming) map.set(a.id, a);
    return { addresses: Array.from(map.values()) };
  }),
  setTechnicians: (technicians) => set({ technicians }),
  addTechnician: (name) => {
    const tech: Technician = {
      id: uuid(),
      name,
      color: TECH_COLORS[get().technicians.length % TECH_COLORS.length],
    };
    set((s) => ({ technicians: [...s.technicians, tech] }));
    return tech;
  },
  removeTechnician: (id) => set((s) => ({ technicians: s.technicians.filter((t) => t.id !== id) })),
  setSplitStrategy: (splitStrategy) => set({ splitStrategy }),
  setAssignment: (assignment) => set({ assignment: new Map(assignment) }),
  moveStop: (addressId, toTechId) => set((s) => {
    const next = new Map<string, string[]>();
    s.assignment.forEach((stops, techId) => {
      next.set(techId, stops.filter((id) => id !== addressId));
    });
    if (!next.has(toTechId)) next.set(toTechId, []);
    next.get(toTechId)!.push(addressId);
    return { assignment: next };
  }),
  setRoutes: (routes) => set({ routes }),
  reset: () => set({
    addresses: [], technicians: [], routes: [], assignment: new Map(),
  }),
}));
