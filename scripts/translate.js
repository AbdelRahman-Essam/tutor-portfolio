'use strict';
// Generates the stored Arabic translations that build-site.js bakes into
// each page (see bi() in build-site.js), instead of translating on the fly
// in the visitor's browser (the old approach used Google's Website
// Translator widget — see SYSTEM_OVERVIEW.md §6 for why that was dropped).
//
// For every profile in data/profiles/*.json, this walks the specific
// free-text fields listed in TRANSLATABLE_PATHS (in scripts/lib/i18n.js,
// shared with the edit backend's Arabic translations panel — summaries,
// descriptions, category tags like "Beginner"/"Business English" — not
// proper nouns like names, institutions, or contact handles, which
// shouldn't be machine-translated), finds any text with no cached
// translation yet, and translates it into Arabic via MyMemory
// (mymemory.translated.net) — a free translation API, no account or API
// key required. The result is merged into data/i18n/<profileKey>.json — a
// plain, human-editable {"English text": "Arabic text"} dictionary.
// Re-running this script is cheap and safe: only strings actually missing
// from the cache are ever sent out for translation, and hand edits to an
// i18n file are preserved (never overwritten) as long as the English text
// still matches.
//
// Usage:
//   node scripts/translate.js              # translate every profile
//   node scripts/translate.js ahmed-mohamed # just one profile
//
// MyMemory's anonymous free tier caps out around 5,000 words/day per IP.
// If you register a free email with them, passing it via MYMEMORY_EMAIL
// raises that to ~50,000 words/day (https://mymemory.translated.net/doc/keygen.php
// — no signup fee, just an email to reduce their abuse). Not required for
// a handful of profiles.
//
//   export MYMEMORY_EMAIL=you@example.com   # optional, raises the daily cap
//
// Requires Node 18+ (built-in fetch). Run this, then scripts/build-site.js
// (or let server/index.js's save handler call buildOneProfile — it reads
// whatever is already cached; it does not call MyMemory itself).
//
// Since anyone can read/edit data/i18n/<key>.json directly, a translation
// this script gets wrong (MyMemory is decent but not perfect, especially
// on short category tags out of context) is always fixable by hand —
// this script will never overwrite an existing entry, only add missing
// ones.

const fs = require('fs');
const path = require('path');
const { collectStrings } = require('./lib/i18n');

const ROOT = path.join(__dirname, '..');
const PROFILES_DIR = path.join(ROOT, 'data', 'profiles');
const I18N_DIR = path.join(ROOT, 'data', 'i18n');

const API_URL = 'https://api.mymemory.translated.net/get';
const MAX_CHUNK_CHARS = 480; // MyMemory rejects requests over ~500 chars; stay well under
const REQUEST_DELAY_MS = 350; // be polite to a free, shared service
const MAX_RETRIES = 3;

// The list of which fields get translated (TRANSLATABLE_PATHS) now lives in
// scripts/lib/i18n.js, shared with server/lib/profile-store.js so the edit
// backend's "Arabic translations" panel offers exactly the same fields this
// script would translate.

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// MyMemory only takes one string per request and caps request length, so a
// long summary/description gets split on sentence boundaries into chunks
// under the limit, translated one at a time, and rejoined. Most fields
// (tags, titles, short descriptions) are a single "chunk" in practice.
function splitIntoChunks(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [text];
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && (current + sentence).length > maxLen) {
      chunks.push(current.trim());
      current = '';
    }
    if (sentence.length > maxLen) {
      // A single "sentence" is itself too long (no punctuation to split
      // on) — fall back to a hard cut so we never send an over-limit
      // request; rare in practice for this site's content.
      if (current) { chunks.push(current.trim()); current = ''; }
      for (let i = 0; i < sentence.length; i += maxLen) chunks.push(sentence.slice(i, i + maxLen).trim());
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

async function translateChunk(text, attempt = 1) {
  const email = process.env.MYMEMORY_EMAIL;
  const params = new URLSearchParams({ q: text, langpair: 'en|ar' });
  if (email) params.set('de', email);

  const res = await fetch(`${API_URL}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`MyMemory HTTP error ${res.status}`);
  }
  const data = await res.json();

  // MyMemory signals problems (quota exceeded, malformed request) via
  // responseStatus/responseDetails rather than always using an HTTP error
  // status, so check both.
  const status = data.responseStatus;
  if (status && Number(status) !== 200) {
    const detail = String(data.responseDetails || '');
    if (/quota|limit/i.test(detail) && attempt < MAX_RETRIES) {
      // Free-tier daily quota errors won't clear on retry within the same
      // run, but a transient rate-limit blip might — back off and try a
      // couple more times before giving up on this string.
      await sleep(2000 * attempt);
      return translateChunk(text, attempt + 1);
    }
    throw new Error(`MyMemory error: ${detail || status}`);
  }

  const translated = data.responseData && data.responseData.translatedText;
  if (!translated) throw new Error('MyMemory returned no translated text.');
  return translated;
}

async function translateString(text) {
  const chunks = splitIntoChunks(text, MAX_CHUNK_CHARS);
  const translatedChunks = [];
  for (const chunk of chunks) {
    translatedChunks.push(await translateChunk(chunk));
    if (chunks.length > 1) await sleep(REQUEST_DELAY_MS);
  }
  return translatedChunks.join(' ');
}

async function translateProfile(file) {
  const profile = JSON.parse(fs.readFileSync(path.join(PROFILES_DIR, file), 'utf8'));
  const key = profile.profileKey || file.replace(/\.json$/, '');
  const dictPath = path.join(I18N_DIR, `${key}.json`);
  const existing = fs.existsSync(dictPath) ? JSON.parse(fs.readFileSync(dictPath, 'utf8')) : {};

  const wanted = collectStrings(profile);
  const missing = [...wanted].filter((s) => !(s in existing));

  if (!missing.length) {
    console.log(`${key}: up to date (${Object.keys(existing).length} cached string(s))`);
    return { translated: 0, failed: 0 };
  }

  console.log(`${key}: translating ${missing.length} new string(s)...`);
  const merged = { ...existing };
  let failed = 0;
  for (const s of missing) {
    try {
      merged[s] = await translateString(s);
    } catch (e) {
      failed++;
      console.warn(`  ! failed to translate "${s.slice(0, 60)}${s.length > 60 ? '…' : ''}": ${e.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  fs.mkdirSync(I18N_DIR, { recursive: true });
  fs.writeFileSync(dictPath, JSON.stringify(merged, null, 2) + '\n');
  console.log(`  saved -> data/i18n/${key}.json (${Object.keys(merged).length} total string(s)${failed ? `, ${failed} failed this run` : ''})`);
  return { translated: missing.length - failed, failed };
}

async function main() {
  const only = process.argv[2]; // optional: a single profileKey
  if (!fs.existsSync(PROFILES_DIR)) {
    console.error('No data/profiles/ directory — run scripts/sync.js first.');
    process.exit(1);
  }

  let files = fs.readdirSync(PROFILES_DIR).filter((f) => f.endsWith('.json'));
  if (only) {
    files = files.filter((f) => f === `${only}.json`);
    if (!files.length) {
      console.error(`No profile found for "${only}" in data/profiles/.`);
      process.exit(1);
    }
  }

  let totalNew = 0;
  let totalFailed = 0;
  for (const file of files) {
    const { translated, failed } = await translateProfile(file);
    totalNew += translated;
    totalFailed += failed;
  }
  console.log(`Done. ${totalNew} new string(s) translated across ${files.length} profile(s).`);
  if (totalFailed) {
    console.log(`${totalFailed} string(s) failed — re-run this script to retry just those (already-translated strings are skipped).`);
  }
  if (totalNew > 0) {
    console.log('Run node scripts/build-site.js to bake the new translations into the site.');
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
