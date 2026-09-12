'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseCSVToObjects } = require('./csv');

const ROOT = path.join(__dirname, '..');
const RAW_CSV = path.join(ROOT, 'data', 'raw', 'tutors.csv');
const OUT_TUTORS_DIR = path.join(ROOT, 'data', 'tutors');
const OUT_INDEX = path.join(ROOT, 'data', 'index.json');

const VIDEO_SLOTS = 5;
const CERT_SLOTS = 7;

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function clean(v) {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

function splitList(v) {
  const s = clean(v);
  if (!s) return [];
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

function slugify(input) {
  return String(input)
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function stableId(row) {
  const seed = clean(row['Email Address']) || clean(row['Full Name']) + clean(row['Timestamp']);
  return crypto.createHash('sha1').update(String(seed)).digest('hex').slice(0, 12);
}

function extractYouTubeId(url) {
  const m = String(url).match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/
  );
  return m ? m[1] : null;
}

function extractDriveId(url) {
  const m = String(url).match(/\/d\/([a-zA-Z0-9_-]{10,})/) || String(url).match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : null;
}

/**
 * Normalizes any supported media URL (YouTube or Google Drive) into an embeddable shape.
 * kind: 'video' | 'image' | 'file'
 */
function normalizeMedia(url, kind) {
  const u = clean(url);
  if (!u) return undefined;

  const ytId = extractYouTubeId(u);
  if (ytId) {
    return {
      provider: 'youtube',
      id: ytId,
      embedUrl: `https://www.youtube.com/embed/${ytId}`,
    };
  }

  const driveId = extractDriveId(u);
  if (driveId) {
    if (kind === 'image') {
      return {
        provider: 'drive',
        id: driveId,
        // Google's thumbnail endpoint hotlinks far more reliably than uc?export=view,
        // which frequently gets blocked or shows a virus-scan interstitial.
        embedUrl: `https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`,
      };
    }
    // video or generic file (certificates, docs) -> iframe preview, works for
    // Drive-hosted videos, PDFs, and images alike
    return {
      provider: 'drive',
      id: driveId,
      embedUrl: `https://drive.google.com/file/d/${driveId}/preview`,
    };
  }

  // Unrecognized URL shape — don't guess, just drop it so the frontend never
  // gets a broken embed. Surfaced in the sync report instead.
  return undefined;
}

function parseLanguages(row) {
  const spokenList = splitList(row['Languages You Can Communicate/Teach In']);
  const englishLevel = clean(row['English Proficiency']);
  const otherRaw = clean(row['Other Language Proficiency']);

  const KNOWN_LEVELS = ['Native', 'Fluent', 'Advanced', 'Intermediate', 'Basic'];
  const languages = [];

  if (spokenList.some((l) => l.toLowerCase() === 'english') && englishLevel) {
    languages.push({ language: 'English', proficiency: englishLevel });
  }

  if (otherRaw) {
    // Supports "Arabic — Native", multiple entries separated by , or ; or newlines
    const entries = otherRaw.split(/[\n;]|(?<=\p{L})\s*,\s*(?=[\p{Lu}])/gu).map((e) => e.trim()).filter(Boolean);
    for (const entry of entries) {
      const parts = entry.split(/—|-|:/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const [lang, level] = parts;
        const matchedLevel = KNOWN_LEVELS.find((k) => k.toLowerCase() === level.toLowerCase()) || level;
        if (!languages.some((l) => l.language.toLowerCase() === lang.toLowerCase())) {
          languages.push({ language: lang, proficiency: matchedLevel });
        }
      }
    }
  }

  // Any spoken language with no explicit level falls back to unlisted-but-present
  for (const lang of spokenList) {
    if (lang.toLowerCase() === 'english') continue;
    if (!languages.some((l) => l.language.toLowerCase() === lang.toLowerCase())) {
      languages.push({ language: lang });
    }
  }

  return languages;
}

function parseVideos(row, warnings) {
  const videos = [];
  for (let i = 1; i <= VIDEO_SLOTS; i++) {
    const title = clean(row[`Video ${i} — Title`]);
    const description = clean(row[`Video ${i} — Description`]);
    const url = clean(row[`Video ${i} — YouTube/GoogleDrive URL`]);
    if (!url) continue;

    const media = normalizeMedia(url, 'video');
    if (!media) {
      warnings.push(`Video ${i}: unrecognized URL format, skipped: ${url}`);
      continue;
    }
    videos.push({
      title: title || `Video ${i}`,
      description,
      ...media,
    });
  }
  return videos;
}

function parseCertificates(row, warnings) {
  const certs = [];
  for (let i = 1; i <= CERT_SLOTS; i++) {
    const name = clean(row[`Certificate ${i} — Name`]);
    const organization = clean(row[`Certificate ${i} — Issuing Organization`]);
    const date = clean(row[`Certificate ${i} — Date`]);
    const description = clean(row[`Certificate ${i} — Description`]);
    const fileUrl = clean(row[`Certificate ${i} — File`]);

    if (!name && !fileUrl) continue;

    const file = fileUrl ? normalizeMedia(fileUrl, 'file') : undefined;
    if (fileUrl && !file) {
      warnings.push(`Certificate ${i}: unrecognized file URL format, skipped embed: ${fileUrl}`);
    }

    certs.push({
      name: name || 'Certificate',
      organization,
      date,
      description,
      file,
    });
  }
  return certs;
}

function parseContacts(row) {
  const contacts = {
    email: clean(row['Professional Email']),
    whatsapp: clean(row['WhatsApp Number']),
    phone: clean(row['Phone Number']),
    telegram: clean(row['Telegram']),
    facebook: clean(row['Facebook']),
    instagram: clean(row['Instagram']),
    linkedin: clean(row['LinkedIn']),
    website: clean(row['Personal Website']),
  };
  // drop empty keys entirely
  Object.keys(contacts).forEach((k) => contacts[k] === undefined && delete contacts[k]);
  return contacts;
}

function normalizeTutor(row, warnings, usedKeys) {
  const name = clean(row['Full Name']);
  if (!name) {
    warnings.push('Row skipped: missing Full Name.');
    return null;
  }

  let profileKey = slugify(clean(row['Preferred Profile Key']) || name);
  if (!profileKey) {
    warnings.push(`Row skipped: could not derive a valid profile key for "${name}".`);
    return null;
  }
  if (usedKeys.has(profileKey)) {
    const original = profileKey;
    let n = 2;
    while (usedKeys.has(`${original}-${n}`)) n++;
    profileKey = `${original}-${n}`;
    warnings.push(`Duplicate profile key "${original}" for "${name}" — renamed to "${profileKey}". Fix "Preferred Profile Key" in the sheet to control this.`);
  }
  usedKeys.add(profileKey);

  const status = (clean(row['Status']) || 'Pending');
  const visibility = (clean(row['Profile Visibility']) || 'Unlisted').toLowerCase();
  const featured = /^y(es)?$/i.test(clean(row['Featured']) || '');

  const photo = normalizeMedia(row['Profile Photo'], 'image');
  if (row['Profile Photo'] && !photo) {
    warnings.push(`"${name}": profile photo URL not recognized as YouTube/Drive, dropped: ${row['Profile Photo']}`);
  }

  const videos = parseVideos(row, warnings);
  const certificates = parseCertificates(row, warnings);
  const contacts = parseContacts(row);
  const languages = parseLanguages(row);

  const tutor = {
    id: stableId(row),
    profileKey,
    status, // Pending | Approved | Rejected | Hidden
    visibility, // public | unlisted
    featured,

    personal: {
      name,
      title: clean(row['Professional Title']),
      photo,
      summary: clean(row['Professional Summary']),
      theme: (clean(row['Preferred Profile Theme']) || 'emerald').toLowerCase(),
    },

    teaching: {
      specializations: splitList(row['Teaching Specializations']),
      ageGroups: splitList(row['Student Age Groups']),
      levels: splitList(row['Student Levels']),
      format: splitList(row['Teaching Format']),
      availability: clean(row['Current Availability']),
      experienceYears: clean(row['Years of Teaching Experience']),
      experienceDescription: clean(row['Teaching Experience']),
      philosophy: clean(row['Teaching Philosophy']),
    },

    languages,
    technicalSkills: splitList(row['Teaching & Technology Skills']),
    videos,
    contacts,
    certificates,

    // internal/admin only — stripped before writing the public directory index,
    // and the whole tutor file is only written at all if Approved (see below)
    _admin: {
      submittedAt: clean(row['Timestamp']),
      notes: clean(row['Admin Notes']),
    },
  };

  // strip empty arrays/objects for the "hide what's not provided" rule
  if (tutor.teaching.specializations.length === 0) delete tutor.teaching.specializations;
  if (tutor.teaching.ageGroups.length === 0) delete tutor.teaching.ageGroups;
  if (tutor.teaching.levels.length === 0) delete tutor.teaching.levels;
  if (tutor.teaching.format.length === 0) delete tutor.teaching.format;
  if (tutor.languages.length === 0) delete tutor.languages;
  if (tutor.technicalSkills.length === 0) delete tutor.technicalSkills;
  if (tutor.videos.length === 0) delete tutor.videos;
  if (tutor.certificates.length === 0) delete tutor.certificates;
  if (Object.keys(tutor.contacts).length === 0) delete tutor.contacts;

  Object.keys(tutor.teaching).forEach((k) => tutor.teaching[k] === undefined && delete tutor.teaching[k]);
  Object.keys(tutor.personal).forEach((k) => tutor.personal[k] === undefined && delete tutor.personal[k]);

  return tutor;
}

function publicJSON(tutor) {
  // The version written for the frontend: no admin notes, no internal-only fields.
  const { _admin, ...rest } = tutor;
  return rest;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  if (!fs.existsSync(RAW_CSV)) {
    console.error(`Missing input file: ${RAW_CSV}`);
    console.error('Export the Google Sheet as CSV (File → Download → Comma-separated values) and save it there.');
    process.exit(1);
  }

  fs.mkdirSync(OUT_TUTORS_DIR, { recursive: true });
  // clear previously generated tutor files so removed/rejected tutors don't linger
  for (const f of fs.readdirSync(OUT_TUTORS_DIR)) {
    if (f.endsWith('.json')) fs.unlinkSync(path.join(OUT_TUTORS_DIR, f));
  }

  const raw = fs.readFileSync(RAW_CSV, 'utf8');
  const rows = parseCSVToObjects(raw);

  const warnings = [];
  const usedKeys = new Set();
  const allTutors = [];

  for (const row of rows) {
    const tutor = normalizeTutor(row, warnings, usedKeys);
    if (tutor) allTutors.push(tutor);
  }

  let publishedCount = 0;
  const directory = [];

  for (const tutor of allTutors) {
    if (tutor.status.toLowerCase() !== 'approved') continue; // Pending/Rejected/Hidden never get published
    publishedCount++;

    fs.writeFileSync(
      path.join(OUT_TUTORS_DIR, `${tutor.profileKey}.json`),
      JSON.stringify(publicJSON(tutor), null, 2)
    );

    if (tutor.visibility === 'public') {
      directory.push({
        profileKey: tutor.profileKey,
        featured: tutor.featured,
        name: tutor.personal.name,
        title: tutor.personal.title,
        photo: tutor.personal.photo,
        summary: tutor.personal.summary,
        theme: tutor.personal.theme,
        specializations: tutor.teaching.specializations,
        ageGroups: tutor.teaching.ageGroups,
        levels: tutor.teaching.levels,
        format: tutor.teaching.format,
      });
    }
  }

  fs.writeFileSync(OUT_INDEX, JSON.stringify({ generatedAt: new Date().toISOString(), tutors: directory }, null, 2));

  console.log(`Read ${rows.length} row(s) from CSV.`);
  console.log(`Published ${publishedCount} approved tutor JSON file(s) to ${OUT_TUTORS_DIR}`);
  console.log(`Directory (public + approved): ${directory.length} tutor(s) -> ${OUT_INDEX}`);
  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    warnings.forEach((w) => console.log(' - ' + w));
  }
}

main();
