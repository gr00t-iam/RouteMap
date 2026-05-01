-- Route Optimizer — initial schema with row-level security.
--
-- Run this in your Supabase project once: SQL Editor -> "New query" -> paste -> RUN.
-- (Or use the Supabase CLI: `supabase db push`.)

-- ---------- Helpers ----------

create extension if not exists "uuid-ossp";

-- ---------- Organizations & membership ----------
-- An organization owns projects. Users join orgs via org_members.
create table if not exists organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists org_members (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member','viewer')) default 'member',
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- ---------- Projects ----------
create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_org_idx on projects(org_id);

-- ---------- Addresses ----------
create table if not exists addresses (
  id uuid primary key,
  project_id uuid not null references projects(id) on delete cascade,
  stop_number text,
  store_number text,
  name text,
  street text,
  city text,
  state text,
  zip text,
  full_address text not null,
  lat double precision,
  lng double precision,
  geocode_status text not null check (geocode_status in ('pending','matched','unmatched','failed')) default 'pending',
  geocode_message text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists addresses_project_idx on addresses(project_id);

-- ---------- Technicians ----------
create table if not exists technicians (
  id uuid primary key,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  color text not null,
  email text,
  start_lat double precision,
  start_lng double precision,
  end_lat double precision,
  end_lng double precision
);
create index if not exists technicians_project_idx on technicians(project_id);

-- Optional: link a technician row to an actual auth.user so you can give the
-- technician a "view-only" login that sees only their own route. We use this
-- for the per-technician share view.
alter table technicians add column if not exists user_id uuid references auth.users(id);

-- ---------- Routes (one per technician per compute) ----------
create table if not exists routes (
  id uuid primary key,
  project_id uuid not null references projects(id) on delete cascade,
  technician_id uuid not null references technicians(id) on delete cascade,
  stops jsonb not null,
  total_distance_meters double precision not null default 0,
  total_duration_seconds double precision not null default 0,
  computed_at timestamptz not null default now()
);
create index if not exists routes_project_idx on routes(project_id);
create index if not exists routes_tech_idx on routes(technician_id);

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================
alter table organizations  enable row level security;
alter table org_members    enable row level security;
alter table projects       enable row level security;
alter table addresses      enable row level security;
alter table technicians    enable row level security;
alter table routes         enable row level security;

-- Helper: is the current user a member of this org?
create or replace function public.is_org_member(_org uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from org_members m where m.org_id = _org and m.user_id = auth.uid()
  );
$$;

-- Organizations: members can see their orgs.
drop policy if exists org_select on organizations;
create policy org_select on organizations for select using (public.is_org_member(id));
drop policy if exists org_insert on organizations;
create policy org_insert on organizations for insert with check (auth.uid() is not null);

-- Memberships: a user can see their own memberships.
drop policy if exists members_select on org_members;
create policy members_select on org_members for select using (user_id = auth.uid() or public.is_org_member(org_id));
drop policy if exists members_insert on org_members;
create policy members_insert on org_members for insert with check (auth.uid() is not null);

-- Projects: any org member can read; owners/admins/members can write.
drop policy if exists projects_select on projects;
create policy projects_select on projects for select using (org_id is null or public.is_org_member(org_id));
drop policy if exists projects_modify on projects;
create policy projects_modify on projects for all using (org_id is null or public.is_org_member(org_id));

-- Addresses / technicians / routes inherit visibility from their project.
drop policy if exists addresses_all on addresses;
create policy addresses_all on addresses for all using (
  exists (select 1 from projects p where p.id = addresses.project_id and (p.org_id is null or public.is_org_member(p.org_id)))
);

drop policy if exists technicians_all on technicians;
create policy technicians_all on technicians for all using (
  exists (select 1 from projects p where p.id = technicians.project_id and (p.org_id is null or public.is_org_member(p.org_id)))
);

drop policy if exists routes_all on routes;
create policy routes_all on routes for all using (
  exists (select 1 from projects p where p.id = routes.project_id and (p.org_id is null or public.is_org_member(p.org_id)))
);

-- A technician with a linked auth user can SELECT their own route only.
drop policy if exists routes_tech_self_view on routes;
create policy routes_tech_self_view on routes for select using (
  exists (select 1 from technicians t where t.id = routes.technician_id and t.user_id = auth.uid())
);

-- Convenience: keep updated_at fresh.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists projects_updated_at on projects;
create trigger projects_updated_at before update on projects for each row execute function public.touch_updated_at();
