# Viewtube

Clean YouTube frontend. GitHub Pages for the UI, Cloudflare Worker as the CORS proxy, YouTube's own embed player for playback.

**No API key. No build step. No Vercel. Free.**

---

## How it works

| Part | Where | Why |
|---|---|---|
| UI | GitHub Pages | Free static hosting |
| CORS proxy | Cloudflare Worker | Lets the browser call Invidious APIs (free: 100k req/day) |
| Video player | `youtube-nocookie.com/embed` | YouTube's own embed, no proxy detection |
| Metadata + search | Invidious public API | No auth needed |

---

## Deploy — Step by step

### Step 1 — Deploy the Cloudflare Worker (5 min)

You need a free [Cloudflare account](https://dash.cloudflare.com/sign-up).

1. Go to **dash.cloudflare.com → Workers & Pages → Create Worker**
2. Delete the placeholder code in the editor
3. Paste the entire contents of **`cloudflare-worker.js`**
4. Click **Save and Deploy**
5. Copy your Worker URL — it looks like:
   ```
   https://viewtube-proxy.yourname.workers.dev
   ```

That's it. No CLI, no `wrangler`, no config files.

---

### Step 2 — Set your Worker URL in app.js

Open **`app.js`** and change line 13:

```js
// Before:
const PROXY_BASE = 'https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev';

// After (your actual URL):
const PROXY_BASE = 'https://viewtube-proxy.yourname.workers.dev';
```

---

### Step 3 — Deploy to GitHub Pages

1. Create a new GitHub repo (public or private)
2. Upload these 4 files:
   - `index.html`
   - `style.css`
   - `app.js`
   - (optionally) `cloudflare-worker.js` for reference
3. Go to **Settings → Pages → Deploy from branch → main → / (root) → Save**
4. Your site goes live at:
   ```
   https://YOUR-USERNAME.github.io/REPO-NAME
   ```

---

## Adding more Invidious instances

Edit the `ALLOWED_ORIGINS` array in `cloudflare-worker.js` and redeploy.
Edit the `<select id="instance-sel">` in `index.html` to add them to the UI.

Find more public instances at **[api.invidious.io](https://api.invidious.io)** — look for ones with `api: true`.

---

## Features

- Search with sort (relevance / rating / newest / most viewed) and type filters
- Trending by region (9 countries)
- Video player via `youtube-nocookie.com` — works on iPad/iPhone, no proxy detection
- Video metadata, channel info, related videos from Invidious
- Deep links: `?v=VIDEO_ID` and `?q=search+term`
- Switchable instances in the header
- Fully responsive (iPad, iPhone, desktop)

---

## Disclaimer

All video content is © its respective owners. This project does not host or store any YouTube content. It uses YouTube's official embed player and publicly available Invidious APIs. Not affiliated with YouTube or Google.

## License

MIT
