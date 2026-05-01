# PMO Route Optimizer

A web-based route optimization tool for IT PMO field teams. Import a list of stops, geocode them with the U.S. Census Geocoder, optimize routes per technician with OSRM, and export per-technician spreadsheets — all from a single page that runs in any modern browser.

## Features

- **Import** addresses from `.xlsx`, `.csv`, or a public Google Sheet (2,000+ stops supported).
- **Geocoding** via the U.S. Census Geocoder for US addresses (free, no API key, batch-aware up to 10,000 records per request) and OpenStreetMap Nominatim for international addresses (auto-detected from the Country column).
- **International stops are flagged and routed separately** so a technician with stops in both US and Mexico gets two clean routes, never one that bridges an ocean. International stops appear in a different marker style on the map and ship in their own tabs in the export.
- **Routing & turn-by-turn directions** via OSRM (public demo for development; self-host for production).
- **Modern dashboard** with a Leaflet map, KPI tiles, and Chart.js graphs (stops/miles per technician, geocoding status).
- **Four split strategies** for assigning stops to technicians:
  - Equal by stop count
  - By geographic zone (k-means cluster)
  - Manual drag-and-drop
  - Mixed (auto + adjust)
- **Per-technician export** as `.xlsx` or `.csv`, including stop number, store number, address, and turn-by-turn directions sheet — so each tech receives only their own route.
- **Team collaboration** via Supabase: shared projects, row-level security, optional per-technician login that only shows their assigned route.
- **Deployable to GitHub Pages** with a one-click GitHub Action; embeddable in Google Sites via `iframe`.

## Architecture

```
Browser (React + Vite)
  ├─ Leaflet + OpenStreetMap tiles (map)
  ├─ Census Geocoder (REST, single + batch CSV)
  ├─ OSRM /table + /route        (REST)
  ├─ Local optimizer             (nearest-neighbor + 2-opt)
  ├─ Supabase Postgres           (auth, projects, RLS)
  └─ xlsx / Papa Parse           (import & export)
```

No backend code is required — the whole app is static. Supabase provides the persistent multi-user layer.

## Getting started locally

```bash
cp .env.example .env.local
# Fill in your Supabase URL + anon key.
npm install
npm run dev
```

Open http://localhost:5173.

## Step-by-step setup guides

- [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) — connect Supabase from scratch (project, schema, auth, RLS, env vars).
- [docs/GITHUB_SETUP.md](docs/GITHUB_SETUP.md) — push this code to GitHub, enable Pages, configure Action secrets.
- [docs/GOOGLE_SITES_EMBED.md](docs/GOOGLE_SITES_EMBED.md) — embed your live app inside a Google Site.
- [docs/OSRM_SELFHOST.md](docs/OSRM_SELFHOST.md) — run your own OSRM for production scale.
- [docs/USAGE_GUIDE.md](docs/USAGE_GUIDE.md) — end-user walkthrough for your PMO.

## License

Internal — adapt as needed.
