# Embedding the App in Google Sites

Once the GitHub Pages deploy is live (see `GITHUB_SETUP.md`), wrapping it in a Google Site takes about 2 minutes.

## 1. Create or open your Google Site

1. Go to https://sites.google.com/.
2. Click **+ Blank** (or open an existing Site).
3. Give it a name like "Acme PMO Tools".

## 2. Embed the live app

1. On the right-hand panel, click **Insert**.
2. Click **Embed**.
3. In the dialog that opens, choose **By URL**.
4. Paste your live app URL:
   ```
   https://<your-username>.github.io/route-optimizer/
   ```
5. Click **Insert**. Google fetches a preview; resize the embed to fill the page (drag the bottom-right corner).
6. **Publish** the Site (top-right). Pick a custom domain or use the default `sites.google.com/...` URL.

## 3. (Recommended) Use "Embed code" instead of "By URL"

"By URL" sometimes only shows a card. For a full interactive app, do this:

1. **Insert → Embed → Embed code**.
2. Paste:
   ```html
   <iframe
     src="https://<your-username>.github.io/route-optimizer/"
     style="width: 100%; height: 1000px; border: 0;"
     allow="geolocation; clipboard-write"
     loading="lazy">
   </iframe>
   ```
3. Click **Next → Insert**.
4. Drag the embed to fill the page section.

## 4. Restrict to your organization (recommended for PMO data)

1. Site → **Share with others** (top-right).
2. Under **Published**, change visibility to **Restricted** and add only your PMO Google group / specific people.
3. Anyone outside that group will get a Google sign-in wall before seeing the page.

## 5. Caveats

- **Iframe size**: Google Sites doesn't auto-resize iframes. Pick a height (1000–1200 px works for most laptops) and the inner app handles its own scrolling.
- **Cookies**: iframe cookies are partitioned by browser. If a user signs into Supabase inside the iframe, the session lives there, not on `github.io` directly. This is fine — it just means the session is scoped to the Google Site.
- **Geolocation prompts**: Chrome's iframe permission policy requires the `allow="geolocation"` attribute (already in the snippet above) for "use my current location" to work.
- **Mobile**: Google Sites embeds adapt OK on mobile, but the route table is wide. For phone users, recommend the direct GitHub Pages URL.
