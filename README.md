# Git of Anton

Code behind [gitofanton.com](https://gitofanton.com): trending GitHub repositories across every category, ranked from star-count snapshots taken every 4 hours.

- `pipeline/` — data collection and scoring (Node 22, runs in GitHub Actions)
- `web/` — the site (Next.js static export)
- `worker/` — Cloudflare Worker serving the static site
- `config/` — categories, languages, blocklist, overrides

How rankings work: [gitofanton.com/methodology](https://gitofanton.com/methodology/).
