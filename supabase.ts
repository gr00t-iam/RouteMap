// Supabase client + data layer.
//
// All multi-user state (projects, addresses, technicians, routes, route_stops)
// lives in Supabase Postgres with row-level security so users only see data
// in organizations they belong to.
//
// If the env vars are missing, we export `supabase = null` and the rest of
// the app falls back to local-only state. That makes it possible to run the
// dev server before you've finished provisioning Supabase.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Address, Project, Route, Technician } from '@/types';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = URL && KEY ? createClient(URL, KEY) : null;

export const isSupabaseConfigured = () => supabase !== null;

// ---- Auth ----

export async function signInWithEmail(email: string, password: string) {
  if (!supabase) throw new Error('Supabase not configured');
  return supabase.auth.signInWithPassword({ email, password });
}
export async function signUpWithEmail(email: string, password: string) {
  if (!supabase) throw new Error('Supabase not configured');
  return supabase.auth.signUp({ email, password });
}
export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}
export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// ---- Projects ----

export async function listProjects(): Promise<Project[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('projects').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToProject);
}

export async function createProject(name: string): Promise<Project> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('projects')
    .insert({ name })
    .select()
    .single();
  if (error) throw error;
  return rowToProject(data);
}

// ---- Addresses ----

export async function saveAddresses(projectId: string, addresses: Address[]) {
  if (!supabase) return;
  // Replace all addresses for this project (simplest semantics for MVP).
  const { error: delErr } = await supabase.from('addresses').delete().eq('project_id', projectId);
  if (delErr) throw delErr;
  const payload = addresses.map((a) => ({
    id: a.id,
    project_id: projectId,
    stop_number: a.stopNumber,
    store_number: a.storeNumber,
    name: a.name,
    street: a.street,
    city: a.city,
    state: a.state,
    zip: a.zip,
    country: a.country,
    is_international: a.isInternational,
    full_address: a.fullAddress,
    lat: a.lat,
    lng: a.lng,
    geocode_status: a.geocodeStatus,
    geocode_source: a.geocodeSource ?? null,
    geocode_message: a.geocodeMessage ?? null,
    notes: a.notes ?? null,
  }));
  if (payload.length === 0) return;
  // Insert in 500-row chunks to stay under request size limits.
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await supabase.from('addresses').insert(payload.slice(i, i + 500));
    if (error) throw error;
  }
}

export async function loadAddresses(projectId: string): Promise<Address[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('addresses').select('*').eq('project_id', projectId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    projectId: r.project_id,
    stopNumber: r.stop_number,
    storeNumber: r.store_number,
    name: r.name,
    street: r.street,
    city: r.city,
    state: r.state,
    zip: r.zip,
    country: r.country ?? 'US',
    isInternational: r.is_international ?? false,
    fullAddress: r.full_address,
    lat: r.lat,
    lng: r.lng,
    geocodeStatus: r.geocode_status,
    geocodeSource: r.geocode_source ?? undefined,
    geocodeMessage: r.geocode_message ?? undefined,
    notes: r.notes ?? undefined,
  }));
}

// ---- Technicians ----

export async function saveTechnicians(projectId: string, technicians: Technician[]) {
  if (!supabase) return;
  await supabase.from('technicians').delete().eq('project_id', projectId);
  const payload = technicians.map((t) => ({
    id: t.id,
    project_id: projectId,
    name: t.name,
    color: t.color,
    email: t.email ?? null,
    start_lat: t.startLat ?? null,
    start_lng: t.startLng ?? null,
    end_lat: t.endLat ?? null,
    end_lng: t.endLng ?? null,
  }));
  if (payload.length === 0) return;
  const { error } = await supabase.from('technicians').insert(payload);
  if (error) throw error;
}

// ---- Routes ----

export async function saveRoutes(projectId: string, routes: Route[]) {
  if (!supabase) return;
  // Wipe and recompute. Store stops as an embedded JSON array on the route row
  // for simplicity (the route_stops table exists for richer reporting later).
  await supabase.from('routes').delete().eq('project_id', projectId);
  const payload = routes.map((r) => ({
    id: r.id,
    project_id: projectId,
    technician_id: r.technicianId,
    country: r.country,
    stops: r.stops,
    total_distance_meters: r.totalDistanceMeters,
    total_duration_seconds: r.totalDurationSeconds,
    computed_at: r.computedAt,
  }));
  if (payload.length === 0) return;
  const { error } = await supabase.from('routes').insert(payload);
  if (error) throw error;
}

// ---- Helpers ----

function rowToProject(r: Record<string, unknown>): Project {
  return {
    id: r.id as string,
    orgId: r.org_id as string | undefined,
    name: r.name as string,
    createdBy: r.created_by as string | undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}
