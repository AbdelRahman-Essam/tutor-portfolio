'use strict';
// Generates the stored Arabic translations that build-site.js bakes into
// each page (see bi() in build-site.js), instead of translating on the fly
// in the visitor's browser (the old approach used Google's Website
// Translator widget — see SYSTEM_OVERVIEW.md §6 for why that was dropped).
//
// For every profile in data/profiles/*.json, this walks the specific
// free-text fields listed in TRANSLATABLE_PATHS below (summaries,
// descriptions, category tags like "Beginner"/"Business English" — not
// proper nouns like names, institutions, or contact handles, which
// shouldn't be machine-translated), finds any text with no cached
// translation yet, and asks Claude for Arabic translations in batches. The
// result is merged into data/i18n/<profileKey>.json — a plain, human-
// editable {"English text": "Arabic text"} dictionary. Re-running this
// script is cheap and safe: only strings actually missing from the cache
// are ever sent to the API, and hand edits to an i18n file are preserved
// (never overwritten) as long as the English text still matches.
//
// Usage:
//   export ANTHROPIC_API_KEY=sk-ant-...
//   node scripts/translate.js              # translate every profile
//   node scripts/translate.js ahmed-mohamed # just one profile
//
// Requires Node 18+ (built-in fetch). Run this, then scripts/build-site.js
// (or let server/index.js's save handler call buildOneProfile — it reads
// whatever is already cached; it does not call the API itself).

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PROFILES_DIR = path.join(ROOT, 'data', 'profiles');
const I18N_DIR = path.join(ROOT, 'data', 'i18n');

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const BATCH_SIZE = 40;

// Dotted paths into a profile object identifying exactly which fields get
// machine-translated. `foo[]` means "for every item in this array"; a
// trailing `.bar` after `foo[]` means "the `bar` field of each item" (for
// arrays of objects); no trailing segment means "each item is itself the
// string" (for arrays of plain strings). Anything not listed here — names,
// organizations/institutions, contact handles, IDs, dates, theme words — is
// left exactly as entered, on purpose: those are proper nouns/identifiers,
// not sentences, and machine translation tends to mangle them.
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

function collectStrings(profile) {
  const out = new Set();
  for (const p of TRANSLATABLE_PATHS) collectPath(profile, p.split('.'), out);
  return out;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function translateBatch(strings) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Export it before running scripts/translate.js.');
  }

  const numbered = strings.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const prompt = `Translate each numbered line below from English into natural, professional Modern Standard Arabic. These are snippets from tutor/professional portfolio pages (summaries, skill tags, experience descriptions). Keep each translation roughly the same register (a short tag stays a short tag, a full sentence stays a full sentence). Respond with ONLY a JSON object mapping each line's exact original English text to its Arabic translation - no numbering in the output, no markdown code fences, no extra commentary.\n\n${numbered}`;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = await res.json();
  const textBlock = (data.content || []).find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No text content in API response.');

  const cleaned = textBlock.text.trim()
    .replace(/^```(json)?/i, '')
    .replace(/```$/, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Could not parse translation response as JSON: ${e.message}\nRaw response: ${cleaned.slice(0, 500)}`);
  }
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
    return 0;
  }

  console.log(`${key}: translating ${missing.length} new string(s)...`);
  const merged = { ...existing };
  for (const batch of chunk(missing, BATCH_SIZE)) {
    const translated = await translateBatch(batch);
    for (const s of batch) {
      if (translated[s]) {
        merged[s] = translated[s];
      } else {
        console.warn(`  ! no translation returned for: "${s.slice(0, 60)}${s.length > 60 ? '…' : ''}"`);
      }
    }
  }

  fs.mkdirSync(I18N_DIR, { recursive: true });
  fs.writeFileSync(dictPath, JSON.stringify(merged, null, 2) + '\n');
  console.log(`  saved -> data/i18n/${key}.json (${Object.keys(merged).length} total string(s))`);
  return missing.length;
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
  for (const file of files) {
    totalNew += await translateProfile(file);
  }
  console.log(`Done. ${totalNew} new string(s) translated across ${files.length} profile(s).`);
  if (totalNew > 0) {
    console.log('Run node scripts/build-site.js to bake the new translations into the site.');
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
