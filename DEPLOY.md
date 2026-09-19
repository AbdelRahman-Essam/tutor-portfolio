# Deployment commands — tutor-portfolio

Server: Ubuntu, nginx, repo at `/home/trustech/projects/tutor-portfolio`,
domain `https://trustech-tutor-portfolio.duckdns.org`.

`/var/www/tutor-portfolio` is a **symlink** to this repo's `site/` folder —
rebuilding the site *is* deploying it, no separate copy/rsync step.

---

## The one command for almost everything

```bash
cd /home/trustech/projects/tutor-portfolio
git pull
./deploy/redeploy.sh
```

Rebuilds the site from `data/raw/*.csv`, generates any new translations,
rebuilds every page, installs `server/node_modules` if missing, restarts
the backend, and runs a health check at the end.

If you get `Permission denied` running it:
```bash
chmod +x deploy/redeploy.sh
git update-index --chmod=+x deploy/redeploy.sh
git commit -m "Make redeploy.sh executable"
git push
```

---

## By situation

### New/updated CSV export
```bash
cd /home/trustech/projects/tutor-portfolio
cp /path/to/new-export.csv data/raw/tutors.csv   # or professionals.csv
node scripts/sync.js
node scripts/translate.js
node scripts/build-site.js
```
No restart needed — static files, served directly.

### Pulled new backend code (`server/` or `scripts/` changed)
```bash
cd /home/trustech/projects/tutor-portfolio
git pull
cd server && npm install --omit=dev && cd ..
sudo systemctl restart profile-backend
```
**Restart is required** — Node keeps running old code from memory until
restarted, even once the file on disk has changed.

### Only frontend styling/templates changed
```bash
cd /home/trustech/projects/tutor-portfolio
git pull
node scripts/build-site.js
```
No restart needed.

### A profile owner edits their own page via `/edit`
Nothing to do — saves and rebuilds itself automatically.

---

## Health / sanity checks

```bash
curl -s http://127.0.0.1:3000/api/health
sudo systemctl status profile-backend --no-pager | grep -i active
sudo nginx -t
```

## Login/account management

```bash
cd /home/trustech/projects/tutor-portfolio/server
node create-user.js <profileKey> <username> '<password>'
```
Safe to re-run for an existing username — resets its password.

## Restarting / troubleshooting the backend

```bash
sudo systemctl restart profile-backend
sudo systemctl status profile-backend --no-pager
sudo journalctl -u profile-backend.service --no-pager -n 30
```

If `journalctl` shows `Failed to load environment files`, the secret file
is missing or the unit's path to it is wrong:
```bash
grep EnvironmentFile /etc/systemd/system/profile-backend.service
# should print: EnvironmentFile=/etc/profile-backend.env
ls -la /etc/profile-backend.env
```
If either looks wrong, recreate it:
```bash
SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
sudo tee /etc/profile-backend.env > /dev/null <<ENV
AUTH_JWT_SECRET=$SECRET
PORT=3000
NODE_ENV=production
MYMEMORY_EMAIL=
ENV
sudo chmod 600 /etc/profile-backend.env
sudo chown root:root /etc/profile-backend.env
sudo sed -i 's|EnvironmentFile=.*|EnvironmentFile=/etc/profile-backend.env|' /etc/systemd/system/profile-backend.service
sudo systemctl daemon-reload
sudo systemctl restart profile-backend
```

If it's `Cannot find module '...'`, dependencies are missing:
```bash
cd /home/trustech/projects/tutor-portfolio/server
npm install --omit=dev
sudo systemctl restart profile-backend
```

---

## Two things that live outside `git pull` — don't expect them to just appear

- **`server/node_modules`** — git-ignored; `redeploy.sh` reinstalls it
  automatically if missing, but a manual `git pull` alone won't restore it.
- **`/etc/profile-backend.env`** — lives outside the repo on purpose (so
  git operations can never wipe it). Only needs creating once per server —
  see the recreate commands above if you're ever setting up a fresh box.

## nginx

Config file: `/etc/nginx/sites-enabled/tutor-portfolio` (or
`sites-available/`, symlinked). After any change to it:
```bash
sudo nginx -t && sudo systemctl reload nginx
```
