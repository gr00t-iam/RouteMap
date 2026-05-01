# Connecting Supabase — Step-by-Step

Supabase is what makes this tool a *team* tool. It stores your projects, addresses, technicians, and routes in a Postgres database, handles user logins, and uses row-level security so users only see data inside organizations they belong to.

You'll do this once per organization. End users never have to touch Supabase — they only sign in to the app itself.

## 1. Create a Supabase account

1. Go to https://supabase.com/ and click **Start your project**.
2. Sign up with email or GitHub. The free tier is plenty to start (500 MB database, 50K monthly active users).
3. After verifying your email, click **New Project**.

## 2. Create a Supabase project

1. **Organization**: pick the org Supabase auto-created for you, or create a new one (e.g. "Acme PMO").
2. **Project name**: something like `route-optimizer-prod`.
3. **Database password**: click *Generate a password*, then **save it somewhere safe** (1Password, etc.). You won't need it for the app, but you will need it if you ever connect to the database directly.
4. **Region**: pick the region closest to your team (e.g. `East US (North Virginia)`).
5. **Pricing plan**: Free is fine. Click **Create new project**. Provisioning takes ~1 minute.

## 3. Apply the database schema

The repo includes a single SQL migration that creates every table and security policy you need.

1. In the Supabase dashboard, click the **SQL Editor** icon in the left sidebar.
2. Click **+ New query**.
3. Open the file `supabase/migrations/0001_init.sql` from the repo, copy its entire contents, paste into the editor.
4. Click **Run** (or press ⌘/Ctrl + Enter). You should see "Success. No rows returned."
5. In the left sidebar, click **Database → Tables**. You should now see: `organizations`, `org_members`, `projects`, `addresses`, `technicians`, `routes`.

## 4. Configure authentication

1. Left sidebar → **Authentication → Providers**.
2. **Email** is enabled by default — leave it on.
3. (Optional) Turn on **Google** if you want PMO users to sign in with their work Google account. Follow Supabase's prompts to paste a Google OAuth client ID/secret. This is the smoothest UX, but email-only is fine for getting started.
4. Left sidebar → **Authentication → URL Configuration**. Add your production URL to **Site URL** and **Redirect URLs**, e.g.:
   - `https://<github-username>.github.io/route-optimizer/`
   - `http://localhost:5173` (for local dev)

## 5. Grab the keys the app needs

1. Left sidebar → **Project Settings → API**.
2. Copy:
   - **Project URL** — looks like `https://abcd1234.supabase.co`. This becomes `VITE_SUPABASE_URL`.
   - **Project API keys → `anon` `public`** — a long JWT. This becomes `VITE_SUPABASE_ANON_KEY`.
3. **Never** copy the `service_role` key into the app. It bypasses row-level security and would expose your entire database.

## 6. Plug the keys into the app

### For local dev

```bash
cp .env.example .env.local
```

Open `.env.local` and paste:

```
VITE_SUPABASE_URL=https://abcd1234.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Restart `npm run dev`. The header should now read **Supabase ready**.

### For GitHub Pages (production)

See `docs/GITHUB_SETUP.md`. Short version: set the same two values as repo secrets in GitHub — the build action passes them into the Vite build automatically.

## 7. Create your organization and invite teammates

There's no UI yet for org management (it's a one-time admin task), so do it from the Supabase SQL editor:

```sql
-- Create your org and add yourself as owner.
insert into organizations (name) values ('Acme PMO') returning id;
-- Copy the returned uuid; we'll call it ORG_ID below.

-- Find your auth user id:
select id, email from auth.users;

-- Add yourself:
insert into org_members (org_id, user_id, role)
values ('ORG_ID-from-above', 'YOUR-USER-ID', 'owner');

-- Invite teammates by sharing the app URL. After they sign up,
-- look up their auth.users.id and run:
insert into org_members (org_id, user_id, role)
values ('ORG_ID', 'TEAMMATE_USER_ID', 'member');
```

Once a user is in `org_members`, they can see and edit any project where `projects.org_id` matches.

## 8. (Optional) Per-technician share

To let an individual technician sign in and see *only* their own route:

1. Have the technician create an account in the app (Settings → Create account).
2. In Supabase SQL editor:
   ```sql
   update technicians
     set user_id = (select id from auth.users where email = 'tech@example.com')
     where name = 'Jane Tech';
   ```
3. The RLS policy `routes_tech_self_view` automatically restricts that account to rows where `technicians.user_id = auth.uid()`.

## Troubleshooting

- **"Invalid API key"** — double-check `VITE_SUPABASE_ANON_KEY`. It should start with `eyJ`.
- **"new row violates row-level security policy"** — the user isn't in any org. Add them to `org_members`.
- **Local dev says "Supabase ready" but login fails** — make sure your local URL is whitelisted in Authentication → URL Configuration.
