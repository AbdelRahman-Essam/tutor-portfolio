#!/usr/bin/env bash
# Usage: ./deploy/redeploy.sh
#
# Run this after `git pull`-ing any update — rebuilds the site data and
# restarts the backend. Assumes /var/www/tutor-portfolio is a SYMLINK to
# this repo's site/ folder (see SYSTEM_OVERVIEW.md §7 / the "dual webroot"
# note below) — if it's a real directory instead, add an rsync step back
# in, or just re-run the symlink setup:
#   sudo rm -rf /var/www/tutor-portfolio
#   sudo ln -s "$(pwd)/site" /var/www/tutor-portfolio

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "==> Rebuilding site data..."
node scripts/sync.js
node scripts/translate.js
node scripts/build-site.js

echo
echo "==> Checking backend setup (the real secret now lives outside the repo,"
echo "    at /etc/profile-backend.env, precisely so git operations here can't"
echo "    wipe it — see deploy/profile-backend.service for how to create it)."
if [[ ! -f /etc/profile-backend.env ]]; then
  echo "    !! /etc/profile-backend.env is missing. See the comment at the top"
  echo "       of deploy/profile-backend.service for the one-liner to create it."
  echo "       Skipping backend restart."
  exit 1
fi
if [[ ! -d server/node_modules ]]; then
  echo "==> server/node_modules missing — installing..."
  (cd server && npm install --omit=dev)
fi

echo "==> Restarting backend service..."
sudo systemctl restart profile-backend
sleep 1
sudo systemctl status profile-backend --no-pager --lines=5

echo
echo "==> Done. Quick sanity check:"
curl -s http://127.0.0.1:3000/api/health || echo "  (backend did not respond on 127.0.0.1:3000 — check the status above)"
echo
