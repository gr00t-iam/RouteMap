# Connecting GitHub — Step-by-Step

Goal: get this project into a GitHub repo, then publish it as a live website on GitHub Pages so you can embed it in Google Sites.

## 1. Create a GitHub account (if you don't have one)

1. Go to https://github.com/ and sign up. If your IT PMO has a GitHub Enterprise org, sign in there instead.
2. Verify your email.

## 2. Create a new empty repository

1. Click your avatar → **Your repositories** → **New**.
2. **Repository name**: `route-optimizer` (or anything — but if you change it, the GitHub Pages URL changes too).
3. **Visibility**: pick **Private** if your address lists are sensitive, **Public** otherwise. Both work with GitHub Pages on a free account.
4. Leave **Add a README**, **.gitignore**, and **License** unchecked — the project already has them.
5. Click **Create repository**.

## 3. Push this project to your new repo

If you've used Git before, this is just `git init && git push`. If not, here's the click-by-click:

### Option A: GitHub Desktop (easiest if you're on Windows or Mac)

1. Install https://desktop.github.com/.
2. Sign in with your GitHub account.
3. **File → Add local repository** → pick the `route-optimizer` folder.
4. It'll say "this directory does not appear to be a Git repository — create a repository?" Click that link.
5. **Publish repository**. Tick "Keep this code private" if you want; pick the org you created.
6. Done — your code is now on GitHub.

### Option B: Command line

```bash
cd route-optimizer
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/route-optimizer.git
git push -u origin main
```

If GitHub asks for a password, use a **Personal Access Token** (Settings → Developer settings → Personal access tokens → Tokens (classic) → "Generate new token (classic)" with `repo` scope), not your account password.

## 4. Add the Supabase secrets

The build needs your Supabase keys at *build time* so the bundled JS knows how to reach Supabase.

1. Repo → **Settings → Secrets and variables → Actions**.
2. Click **New repository secret** and add:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://abcd1234.supabase.co` (from Supabase) |
   | `VITE_SUPABASE_ANON_KEY` | the long anon JWT (from Supabase) |
   | `VITE_OSRM_URL` | *(optional)* your self-hosted OSRM URL, otherwise leave it out and the public demo is used |

   These secrets are encrypted; only GitHub Actions can read them at build time.

## 5. Enable GitHub Pages

1. Repo → **Settings → Pages**.
2. **Source**: choose **GitHub Actions**.
3. Save.

## 6. Trigger a deploy

The workflow at `.github/workflows/deploy-pages.yml` runs on every push to `main`. To trigger it the first time:

- Make any edit (e.g., update the README) and push, or
- Go to **Actions → Deploy to GitHub Pages → Run workflow → Run workflow**.

Watch the **Actions** tab. After ~2 minutes, the **deploy** job will print the URL of your live site:

```
https://<your-username>.github.io/route-optimizer/
```

Open it. You should see the dashboard. The header should say **Supabase ready** (because the Action injected your secrets into the build).

## 7. (Important) Add the Pages URL to Supabase

Supabase blocks logins from unknown origins. Tell it about your live URL:

1. Supabase dashboard → **Authentication → URL Configuration**.
2. **Site URL**: `https://<your-username>.github.io/route-optimizer/`
3. Add the same URL under **Redirect URLs**.
4. Save.

## 8. Day-to-day: making changes

Edit files locally → commit → push to `main`. GitHub Actions rebuilds and redeploys automatically.

```bash
git add .
git commit -m "Update import column mapping"
git push
```

Within a couple minutes, the live site reflects your changes.

## Troubleshooting

- **"404 — page not found" on GitHub Pages**: make sure **Settings → Pages → Source** is set to **GitHub Actions**, not "Deploy from a branch".
- **Action failed at "Build" step**: open the failing job log; usually a missing secret. Re-check step 4.
- **Map loads but Supabase doesn't**: did you add your `github.io` URL to Supabase's allowed redirect URLs (step 7)?
- **Deep links 404 from Google Sites**: that's a routing issue. The app uses `HashRouter` to avoid this; if you customized URLs, switch back to hash-style.
