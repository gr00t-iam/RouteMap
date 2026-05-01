# End-User Guide (for your PMO team)

A short walkthrough for the people who will actually use the tool day-to-day.

## 1. Sign in

Open the app URL your admin gave you. Click **Settings → Create account**, enter your work email and a password, and click **Sign in**. Your admin will add you to the right organization, after which you'll see shared projects.

## 2. Import addresses

**From a spreadsheet:** click **Import → Choose file** and pick your `.xlsx` or `.csv`.

The importer recognizes these column headers (case-insensitive):

| Column purpose | Header aliases the importer looks for |
|---|---|
| Stop number | "Stop", "Stop #", "Stop Number", "Sequence" |
| Store number | "Store", "Store #", "Store Number", "Site #", "Location ID" |
| Location name | "Name", "Location", "Site Name", "Store Name" |
| Street address | "Street", "Address", "Address 1", "Street Address" |
| City / State / ZIP | "City", "State", "ZIP" |
| Country | "Country", "Country Code", "Nation" — defaults to `US` if blank |
| Full address (one column) | "Full Address", "Oneline" |
| Notes | "Notes", "Comments" |

### International stops

Anything where the **Country** column is something other than `US` (or recognized US aliases like "USA"/"United States") is automatically flagged as international. International stops:

- Are geocoded via **OpenStreetMap Nominatim** instead of Census (Census is US-only). Nominatim's public server is rate-limited to ~1 req/sec, so a batch of 100 international addresses takes ~2 minutes — for large international workloads, ask your admin to self-host Nominatim.
- Are **routed separately**. A technician with stops in both US and Mexico will get two separate routes (one per country) — never linked across an ocean. Each route is its own row on the dashboard, its own tab in the export, and its own Stop # sequence (1, 2, 3 within each country).
- Show with a **dashed square marker** on the map (US stops use solid circles) so you can scan international vs. domestic at a glance.
- Get an `International: Yes` column and a `Country` column in every export, so downstream systems can filter on them.

If your sheet uses different headers, the importer will warn you. Either rename the columns and re-import, or paste a cleaned copy into a Google Sheet and use that path.

**From a Google Sheet:** set the sheet to **Anyone with the link – Viewer** (Share button → Change → Viewer), copy the URL, and paste into the app's "From Google Sheets" box.

## 3. Geocode

Click **Geocode all (Census)**. Behind the scenes this batches up to 10,000 records per request to the Census Geocoder. The progress bar shows how far along you are.

When it finishes, each row shows a **matched** / **unmatched** badge. Hover an unmatched row to see why (most common: typo in city name, missing ZIP, or the address is outside the US). Fix in your source spreadsheet and re-import if needed.

## 4. Add technicians

Open **Technicians**, type a name, click **Add**. Each tech gets a color used everywhere on the map and exports.

## 5. Pick a split strategy

| Strategy | When to use |
|---|---|
| **Equally by stop count** | All techs are equally productive; you don't care about geography. |
| **By geographic zone** | Techs are spread out; you want to keep each one in a contiguous region. |
| **Manual drag-and-drop** | You already know who covers what; assign by hand. |
| **Mixed** | Auto-cluster geographically, then drag a few outliers to balance. |

Click a strategy and the assignment runs immediately. To reassign manually at any time, drag a stop card onto a different technician's panel.

## 6. Optimize

Click **Routes & Export → Optimize routes**. This:

1. Builds a distance matrix for each technician's stops via OSRM.
2. Runs nearest-neighbor + 2-opt to minimize drive time.
3. Fetches the final polyline and turn-by-turn directions.

The map shows each tech's route in their color, with numbered markers for stop order. The right panel summarizes total miles and hours per tech.

## 7. Export

- **Export all (.xlsx)**: a single workbook with a Summary sheet plus one sheet per tech (and one directions sheet per tech if you tick **Include turn-by-turn directions**).
- **Their .xlsx / Their .csv** (next to each tech): export only that one technician's route. Use this when you want to email a tech only their assignments without exposing other techs' work.

Each row in the export contains: Stop #, Store #, Location Name, Street, City, State, ZIP, Latitude, Longitude, Leg Distance (mi), Leg Duration (min), Notes.

## 8. Share with the team

Anyone in your Supabase organization can open the same project URL and see live updates. If two PMOs are editing the same project, the last write wins — for now, coordinate so you're not both reassigning at once.

## Tips

- The Census Geocoder is U.S. only. International addresses won't match.
- The public OSRM demo is fine for evaluation but rate-limits at scale; ask your admin to confirm a self-hosted OSRM is configured before doing your full 2,000-stop run.
- If a tech needs only their own login (no visibility into anyone else's work), have your admin link their account to a technician row — see Supabase setup doc.
