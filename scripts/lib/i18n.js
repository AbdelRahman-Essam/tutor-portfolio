'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const I18N_DIR = path.join(ROOT, 'data', 'i18n');

// Merges every data/i18n/<profileKey>.json (each one an English -> Arabic
// dictionary produced by scripts/translate.js, or hand-edited) into a single
// flat lookup table. Called once per build; the caller layers its own
// static UI strings on top/underneath as needed.
function loadStoredTranslations() {
  const dict = {};
  if (!fs.existsSync(I18N_DIR)) return dict;
  for (const file of fs.readdirSync(I18N_DIR).filter((f) => f.endsWith('.json'))) {
    const full = path.join(I18N_DIR, file);
    try {
      Object.assign(dict, JSON.parse(fs.readFileSync(full, 'utf8')));
    } catch (e) {
      console.warn(`[i18n] Skipping malformed translation file ${file}: ${e.message}`);
    }
  }
  return dict;
}

// Convenience for build-site.js: static UI strings first, then every stored
// per-profile translation layered on top (profile translations never need
// to override UI chrome, so order only matters if a string is ever reused
// for both purposes — in which case the more specific, hand-checked
// per-profile entry wins).
function loadDictionary(staticUiDict) {
  return Object.assign({}, staticUiDict || {}, loadStoredTranslations());
}

module.exports = { loadDictionary, loadStoredTranslations, I18N_DIR };
