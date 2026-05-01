# Self-hosting OSRM (production scale)

The public demo at `router.project-osrm.org` is rate-limited and explicitly *not* meant for production. For 2,000+ stops you'll hit those limits within minutes. The good news: OSRM is open source and easy to run.

## Option A: Docker on a small VM

Spin up any Linux VM (1–2 vCPU, 4–8 GB RAM is plenty for a single state). DigitalOcean, Hetzner, AWS Lightsail — anywhere.

```bash
# 1. Download an OpenStreetMap extract for the region you operate in.
#    For the entire US, this is ~10 GB. For just a few states, see https://download.geofabrik.de/.
mkdir -p ~/osrm-data && cd ~/osrm-data
wget https://download.geofabrik.de/north-america/us-latest.osm.pbf

# 2. Build the routing graph (one-time, takes 20–60 minutes).
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/us-latest.osm.pbf
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-partition /data/us-latest.osrm
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-customize /data/us-latest.osrm

# 3. Run the server.
docker run -d --restart=always -p 5000:5000 -v "${PWD}:/data" \
  --name osrm osrm/osrm-backend osrm-routed --algorithm mld /data/us-latest.osrm
```

The server is now listening on `http://YOUR-VM:5000`. Test:
```bash
curl "http://YOUR-VM:5000/route/v1/driving/-87.65,41.88;-87.62,41.89?overview=false"
```

## Option B: Hosted alternative

If you don't want to run a VM, swap the routing engine in `.env.local` to OpenRouteService (free 2k req/day) or Mapbox Directions (100k free/mo). Either drops in by changing `VITE_OSRM_URL` and adjusting `src/lib/osrm.ts` to match the new API shape.

## Update the app to use your server

```
# .env.local (or GitHub Action secret)
VITE_OSRM_URL=http://YOUR-VM:5000
```

For HTTPS (required for browser fetch from a `github.io` page), put Caddy or nginx in front:

```
# Caddyfile
osrm.yourdomain.com {
  reverse_proxy localhost:5000
}
```

Then set `VITE_OSRM_URL=https://osrm.yourdomain.com`.

## Sizing guidance

For 2,000 stops with 5 technicians (so ~400 stops each), the OSRM `/table` request returns a 400×400 matrix per tech — about 5 MB JSON each, fast enough on any VM. The 2-opt optimization runs locally in the browser in a few seconds at that size.
