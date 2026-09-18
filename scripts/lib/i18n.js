'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const I18N_DIR = path.join(ROOT, 'data', 'i18n');

// Dotted paths into a profile object identifying exactly which fields get
// translated (by scripts/translate.js, or by hand via the edit backend's
// Arabic translations panel). `foo[]` means "for every item in this
// array"; a trailing `.bar` after `foo[]` means "the `bar` field of each
// item" (for arrays of objects); no trailing segment means "each item is
// itself the string" (for arrays of plain strings). Anything not listed
// here — names, organizations/institutions, contact handles, IDs, dates,
// theme words — is left exactly as entered, on purpose: those are proper
// nouns/identifiers, not sentences, and translation tends to mangle them.
const TRANSLATABLE_PATHS = [
  'personal.title',
  'personal.summary',
  'teaching.specializations[]',
  'teaching.ageGroups[]',
  'teaching.levels[]',
  'teaching.format[]',
  'teaching.availability',
  'teaching.experienceDescription',
  'teaching.philosophy',
  'videos[].title',
  'videos[].type',
  'videos[].description',
  'certificates[].description',
  'professional.experienceSummary',
  'professional.expertise[]',
  'professional.workExperience[].position',
  'professional.workExperience[].period',
  'professional.workExperience[].description',
  'professional.projects[].name',
  'professional.projects[].description',
  'professional.tools[]',
  'education.qualification',
  'education.additional[]',
  'languages[].proficiency',
];

function collectPath(node, parts, out) {
  if (node == null) return;
  const [head, ...rest] = parts;
  const isArray = head.endsWith('[]');
  const key = isArray ? head.slice(0, -2) : head;
  const value = node[key];
  if (value == null) return;
  if (isArray) {
    if (!Array.isArray(value)) return;
    for (const item of value) {
      if (rest.length === 0) {
        if (typeof item === 'string' && item.trim()) out.add(item.trim());
      } else {
        collectPath(item, rest, out);
      }
    }
  } else if (rest.length === 0) {
    if (typeof value === 'string' && value.trim()) out.add(value.trim());
  } else {
    collectPath(value, rest, out);
  }
}

// Every translatable English string actually present in this profile right
// now, as an ordered array (Set preserves insertion order; TRANSLATABLE_PATHS
// order is a reasonable, stable reading order for a translations UI).
function collectStrings(profile) {
  const out = new Set();
  for (const p of TRANSLATABLE_PATHS) collectPath(profile, p.split('.'), out);
  return [...out];
}

// Merges every data/i18n/<profileKey>.json (each one an English -> Arabic
// dictionary produced by scripts/translate.js, or hand-edited — including
// via the edit backend's Arabic translations panel) into a single flat
// lookup table. Called once per build; the caller layers its own static UI
// strings on top/underneath as needed.
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

// Reads (or starts fresh) the per-profile dictionary at
// data/i18n/<profileKey>.json and merges `updates` (an {english: arabic}
// object) into it, without touching any other profile's file. Used by the
// edit backend when a profile owner edits their own Arabic translations.
function saveProfileTranslations(profileKey, updates) {
  fs.mkdirSync(I18N_DIR, { recursive: true });
  const filePath = path.join(I18N_DIR, `${profileKey}.json`);
  const existing = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : {};
  const merged = { ...existing };
  for (const [en, ar] of Object.entries(updates || {})) {
    const key = String(en).trim();
    const val = String(ar || '').trim();
    if (!key) continue;
    if (val) merged[key] = val;
    else delete merged[key]; // an emptied field reverts to "no stored translation" rather than storing blank
  }
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2) + '\n');
  return merged;
}

module.exports = {
  loadDictionary, loadStoredTranslations, saveProfileTranslations,
  collectStrings, TRANSLATABLE_PATHS, I18N_DIR,
};
