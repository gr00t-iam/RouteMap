-- 0002_country.sql
-- Adds country / international flags to addresses and country to routes.
-- Run this in the Supabase SQL editor after 0001_init.sql.

alter table addresses
  add column if not exists country text not null default 'US',
  add column if not exists is_international boolean not null default false,
  add column if not exists geocode_source text;

create index if not exists addresses_country_idx on addresses(country);

alter table routes
  add column if not exists country text not null default 'US';

create index if not exists routes_country_idx on routes(country);
