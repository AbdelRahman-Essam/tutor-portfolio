# Profile Portfolio

Turns Google Form response sheets (tutor and professional/engineering forms
today, more can be added) into a static, per-profile website. No backend,
no database — Google Sheets → Node scripts → plain HTML/CSS/JS.

Full architecture, data schema, and design system are documented in
[`SYSTEM_OVERVIEW.md`](./SYSTEM_OVERVIEW.md).

## Quick start

```bash
# 1. Export each Google Sheet: File → Download → Comma-separated values (.csv)
#    Save every export into data/raw/ (any filenames, any number of files)

node scripts/sync.js        # data/raw/*.csv -> data/profiles/*.json + data/index.json
node scripts/build-site.js  # JSON -> site/index.html + site/p/<key>/index.html
```

Serve `site/` locally to preview (opening the HTML files directly as
`file://` breaks YouTube/Drive embeds — see SYSTEM_OVERVIEW.md §7):

```bash
cd site && python3 -m http.server 8000
# open http://localhost:8000
```

## Deploying

- **GitHub Pages (automatic)**: `.github/workflows/deploy.yml` runs `sync.js`
  + `build-site.js` and publishes `site/` to GitHub Pages on every push to
  `main`. Enable Pages once, under **Settings → Pages → Source: GitHub
  Actions**, and it takes care of the rest.
- **Your own Ubuntu server (nginx)**: see `deploy/nginx-tutor-portfolio.conf`
  and `deploy/update-site.sh`.

## Project layout

```
data/raw/        drop CSV exports here
data/profiles/   generated — one JSON per approved profile
scripts/         sync.js (CSV -> JSON) and build-site.js (JSON -> HTML)
site/            generated static site
deploy/          nginx config + update script for a self-hosted server
```

See `SYSTEM_OVERVIEW.md` for the full data model, admin columns, media
embedding rules, and known issues/decisions log.
