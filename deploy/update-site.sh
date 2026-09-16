#!/usr/bin/env bash
# Usage: ./deploy/update-site.sh /path/to/new-tutors-export.csv
#
# Rebuilds data/tutors/*.json + data/index.json from a fresh CSV export,
# regenerates the static site, and publishes it to the nginx webroot.
# Run this on the server itself (or wherever the webroot lives) any time
# the admin exports a new CSV from the Google Sheet.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEBROOT="/var/www/tutor-portfolio"
NEW_CSV="${1:-}"

if [[ -z "$NEW_CSV" ]]; then
  echo "Usage: $0 /path/to/new-tutors-export.csv"
  exit 1
fi
if [[ ! -f "$NEW_CSV" ]]; then
  echo "File not found: $NEW_CSV"
  exit 1
fi

cp "$NEW_CSV" "$PROJECT_DIR/data/raw/tutors.csv"

cd "$PROJECT_DIR"
node scripts/sync.js
node scripts/build-site.js

sudo mkdir -p "$WEBROOT"
sudo rsync -a --delete "$PROJECT_DIR/site/" "$WEBROOT/"

echo "Published to $WEBROOT"
