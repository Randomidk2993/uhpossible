# Viewtube

A clean YouTube frontend powered by public [Invidious](https://invidious.io) instances. No API key required. Works on iPad, iPhone, desktop — anywhere.

## Features

- **Search** videos with sort + type filters
- **Trending** by region (US, GB, CA, AU, DE, FR, JP, IN, BR)
- **Watch** via YouTube's privacy-enhanced embed (youtube-nocookie.com)
- **Related videos** sidebar
- **Switch instances** — yewtu.be, inv.nadeko.net, invidious.nerdvpn.de, and more
- **Deep links** — `?v=VIDEO_ID` and `?q=search+term` work
- **iPad / mobile friendly** — responsive at every breakpoint
- No tracking, no login, no cookies

## Deploy to GitHub Pages (5 minutes)

1. Fork or upload this folder to a new GitHub repo
2. Go to **Settings → Pages**
3. Set Source to **Deploy from branch**, pick `main`, folder `/` (root)
4. Click Save — your site will be live at `https://YOUR-USERNAME.github.io/REPO-NAME`

That's it. It's pure HTML + CSS + JS, no build step needed.

## Deploy to Netlify / Vercel

Drag and drop the folder into [netlify.com/drop](https://netlify.com/drop) for an instant URL. Or connect the GitHub repo.

## Changing the default instance

Edit the `<select id="instance-select">` in `index.html`, or open a PR to add more instances.

Current public instances:
| Instance | URL |
|---|---|
| yewtu.be | https://yewtu.be |
| inv.nadeko.net | https://inv.nadeko.net |
| invidious.nerdvpn.de | https://invidious.nerdvpn.de |
| iv.melmac.space | https://iv.melmac.space |
| invidious.privacyredirect.com | https://invidious.privacyredirect.com |

More instances: [https://api.invidious.io](https://api.invidious.io)

## How it works

- Search & metadata → Invidious public API (`/api/v1/search`, `/api/v1/videos/:id`, `/api/v1/trending`)
- Video playback → `youtube-nocookie.com/embed/:id` (YouTube's own privacy-enhanced player — no proxy detection issues)
- Thumbnails → served directly from Invidious instance

## Disclaimer

All video content is © its respective owners. This project does not host, store, or claim ownership of any YouTube content. It is a browser-based client that uses publicly available APIs and YouTube's own embed player, similar to how any website embeds YouTube videos.

## License

MIT
