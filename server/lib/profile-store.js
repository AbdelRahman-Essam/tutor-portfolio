'use strict';
const fs = require('fs');
const path = require('path');
const { normalizeMedia } = require('../../scripts/lib/parse');
const { buildOneProfile, buildSite, loadProfile: readProfile, loadIndex } = require('../../scripts/build-site');
const { collectStrings, loadStoredTranslations, saveProfileTranslations } = require('../../scripts/lib/i18n');

const ROOT = path.join(__dirname, '..', '..');
const PROFILES_DIR = path.join(ROOT, 'data', 'profiles');
const DATA_INDEX = path.join(ROOT, 'data', 'index.json');

// Fields a logged-in user may change on their OWN profile. Deliberately
// excluded: id, profileKey, kind, status, visibility, featured — those stay
// admin-controlled (profileKey is the URL slug and kind switches the whole
// page layout; status/visibility/featured are the approval gate from
// sync.js, see SYSTEM_OVERVIEW.md §3). Everything a person would think of
// as "my profile content" is here, which is what "edit any section of his
// own page" means in practice.
function clean(v) {
  return typeof v === 'string' ? v.trim() : v;
}
function cleanList(v) {
  return Array.isArray(v) ? v.map(clean).filter(Boolean) : [];
}

function mergeMedia(existingItem, incoming, kind, warnPrefix, warnings) {
  const url = clean(incoming.url);
  if (url) {
    const media = normalizeMedia(url, kind, (msg) => warnings.push(`${warnPrefix}: ${msg}`), warnPrefix);
    return media || null; // link didn't resolve (folder, unrecognized host, etc) — drop rather than guess
  }
  // No new URL supplied: keep whatever media the existing entry at this
  // position already had (so re-saving the form without touching a video/
  // certificate/photo link doesn't wipe it out).
  if (existingItem && existingItem.provider) {
    const { provider, id, embedUrl } = existingItem;
    return { provider, id, embedUrl };
  }
  return null;
}

function applyPersonal(existing, incoming, warnings) {
  const p = { ...existing.personal };
  if (incoming.name != null) p.name = clean(incoming.name) || p.name;
  if (incoming.title != null) p.title = clean(incoming.title);
  if (incoming.summary != null) p.summary = clean(incoming.summary);
  if (incoming.theme != null) p.theme = clean(incoming.theme);
  if (incoming.specialization != null) p.specialization = clean(incoming.specialization);
  if (incoming.location != null) p.location = clean(incoming.location);
  const photoMedia = mergeMedia(existing.personal.photo, { url: incoming.photoUrl }, 'image', 'Photo', warnings);
  if (incoming.photoUrl) p.photo = photoMedia || p.photo;
  return p;
}

function applyTeaching(existing, incoming) {
  const teaching = { ...(existing.teaching || {}) };
  if (incoming.specializations != null) teaching.specializations = cleanList(incoming.specializations);
  if (incoming.ageGroups != null) teaching.ageGroups = cleanList(incoming.ageGroups);
  if (incoming.levels != null) teaching.levels = cleanList(incoming.levels);
  if (incoming.format != null) teaching.format = cleanList(incoming.format);
  if (incoming.availability != null) teaching.availability = clean(incoming.availability);
  if (incoming.experienceYears != null) teaching.experienceYears = clean(incoming.experienceYears);
  if (incoming.experienceDescription != null) teaching.experienceDescription = clean(incoming.experienceDescription);
  if (incoming.philosophy != null) teaching.philosophy = clean(incoming.philosophy);
  return teaching;
}

function applyProfessional(existing, incoming) {
  const pro = { ...(existing.professional || {}) };
  if (incoming.experienceYears != null) pro.experienceYears = clean(incoming.experienceYears);
  if (incoming.experienceSummary != null) pro.experienceSummary = clean(incoming.experienceSummary);
  if (incoming.expertise != null) pro.expertise = cleanList(incoming.expertise);
  if (incoming.tools != null) pro.tools = cleanList(incoming.tools);
  if (Array.isArray(incoming.workExperience)) {
    pro.workExperience = incoming.workExperience
      .map((w) => ({
        position: clean(w.position) || '',
        organization: clean(w.organization) || '',
        period: clean(w.period) || '',
        description: clean(w.description) || '',
      }))
      .filter((w) => w.position || w.organization || w.description);
  }
  if (Array.isArray(incoming.projects)) {
    pro.projects = incoming.projects
      .map((x) => ({ name: clean(x.name) || '', description: clean(x.description) || '' }))
      .filter((x) => x.name || x.description);
  }
  return pro;
}

function applyEducation(existing, incoming) {
  const edu = { ...(existing.education || {}) };
  if (incoming.qualification != null) edu.qualification = clean(incoming.qualification);
  if (incoming.institution != null) edu.institution = clean(incoming.institution);
  if (incoming.graduationYear != null) edu.graduationYear = clean(incoming.graduationYear);
  if (incoming.additional != null) edu.additional = cleanList(incoming.additional);
  return edu;
}

function applyVideos(existing, incoming, warnings) {
  if (!Array.isArray(incoming)) return existing.videos || [];
  const existingVideos = existing.videos || [];
  return incoming
    .map((v, i) => {
      const title = clean(v.title) || `Video ${i + 1}`;
      const media = mergeMedia(existingVideos[i], v, 'video', title, warnings);
      if (!media) return null; // no usable link, old or new — drop this entry
      return { title, type: clean(v.type) || '', description: clean(v.description) || '', ...media };
    })
    .filter(Boolean);
}

function applyCertificates(existing, incoming, warnings) {
  if (!Array.isArray(incoming)) return existing.certificates || [];
  const existingCerts = existing.certificates || [];
  return incoming
    .map((c, i) => {
      const name = clean(c.name) || `Certificate ${i + 1}`;
      const file = mergeMedia(existingCerts[i] && existingCerts[i].file, c, 'file', name, warnings);
      return {
        name,
        organization: clean(c.organization) || '',
        date: clean(c.date) || '',
        description: clean(c.description) || '',
        ...(file ? { file } : {}),
      };
    })
    .filter((c) => c.name);
}

function applyLanguages(incoming) {
  if (!Array.isArray(incoming)) return undefined;
  return incoming
    .map((l) => ({ language: clean(l.language) || '', proficiency: clean(l.proficiency) || '' }))
    .filter((l) => l.language);
}

function applyContacts(existing, incoming) {
  if (!incoming || typeof incoming !== 'object') return existing.contacts || {};
  const contacts = { ...(existing.contacts || {}) };
  for (const key of ['email', 'whatsapp', 'phone', 'telegram', 'facebook', 'instagram', 'linkedin', 'github', 'website']) {
    if (incoming[key] != null) {
      const v = clean(incoming[key]);
      if (v) contacts[key] = v;
      else delete contacts[key];
    }
  }
  return contacts;
}

// Applies `edits` (whatever the edit form submitted) on top of the current
// stored profile for `profileKey`, writes the result back to
// data/profiles/<key>.json, patches the matching entry in data/index.json,
// re-renders that profile's page + the directory page, and returns the
// updated profile plus any non-fatal warnings (e.g. a pasted link that
// didn't resolve to a YouTube/Drive file).
function updateProfile(profileKey, edits) {
  const existing = readProfile(profileKey);
  if (!existing) {
    const err = new Error(`No profile found for "${profileKey}".`);
    err.status = 404;
    throw err;
  }

  const warnings = [];
  const updated = { ...existing };

  if (edits.personal) updated.personal = applyPersonal(existing, edits.personal, warnings);
  if (existing.kind === 'tutor' && edits.teaching) updated.teaching = applyTeaching(existing, edits.teaching);
  if (existing.kind === 'professional' && edits.professional) updated.professional = applyProfessional(existing, edits.professional);
  if (edits.education) updated.education = applyEducation(existing, edits.education);
  if (edits.videos !== undefined) updated.videos = applyVideos(existing, edits.videos, warnings);
  if (edits.certificates !== undefined) updated.certificates = applyCertificates(existing, edits.certificates, warnings);
  if (edits.languages !== undefined) {
    const langs = applyLanguages(edits.languages);
    if (langs) updated.languages = langs;
  }
  if (existing.kind === 'tutor' && edits.skills !== undefined) updated.skills = cleanList(edits.skills);
  if (edits.contacts) updated.contacts = applyContacts(existing, edits.contacts);

  fs.mkdirSync(PROFILES_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROFILES_DIR, `${profileKey}.json`), JSON.stringify(updated, null, 2) + '\n');

  patchIndexEntry(updated);
  buildOneProfile(updated);

  return { profile: updated, warnings };
}

// Keeps the directory listing (site/index.html, generated from
// data/index.json) showing current name/title/summary/tags/theme/location
// without waiting for the next full scripts/sync.js run.
function patchIndexEntry(profile) {
  const directory = loadIndex();
  if (!directory) return;
  const entry = directory.profiles.find((p) => p.profileKey === profile.profileKey);
  if (!entry) return;

  entry.name = profile.personal.name;
  entry.title = profile.personal.title;
  entry.summary = profile.personal.summary;
  entry.theme = profile.personal.theme;
  entry.photo = profile.personal.photo;
  if (profile.personal.location) entry.location = profile.personal.location;

  const tagSource = profile.kind === 'professional'
    ? (profile.professional && profile.professional.expertise)
    : (profile.teaching && profile.teaching.specializations);
  if (tagSource) entry.tags = tagSource.slice(0, 3);

  directory.generatedAt = new Date().toISOString();
  fs.writeFileSync(DATA_INDEX, JSON.stringify(directory, null, 2) + '\n');
}

// Every translatable English string currently in this profile (see
// TRANSLATABLE_PATHS in scripts/lib/i18n.js — the same list
// scripts/translate.js uses), paired with whatever Arabic translation is
// currently stored for it, if any. Used to populate the edit page's
// "Arabic translations" panel.
function getTranslations(profileKey) {
  const profile = readProfile(profileKey);
  if (!profile) {
    const err = new Error(`No profile found for "${profileKey}".`);
    err.status = 404;
    throw err;
  }
  const stored = loadStoredTranslations();
  return collectStrings(profile).map((en) => ({ en, ar: stored[en] || '' }));
}

// Saves a logged-in user's own Arabic translation edits. `updates` is an
// {english: arabic} map — typically the whole set from the translations
// panel, though only entries for strings that still exist in the caller's
// profile are written, so a stray/outdated key can't be used to plant an
// unrelated dictionary entry. Note this writes into the SAME global
// dictionary scripts/translate.js and every profile's page reads from
// (see loadDictionary() in scripts/lib/i18n.js): if two profiles happen to
// share an identical English string (a common tag like "Beginner", say),
// editing its translation here updates it everywhere that exact string is
// used, not just on this profile's page. Fine for shared, generic tags;
// worth knowing if that's ever surprising.
function saveTranslations(profileKey, updates) {
  const profile = readProfile(profileKey);
  if (!profile) {
    const err = new Error(`No profile found for "${profileKey}".`);
    err.status = 404;
    throw err;
  }
  const allowed = new Set(collectStrings(profile));
  const filtered = {};
  for (const [en, ar] of Object.entries(updates || {})) {
    if (allowed.has(en)) filtered[en] = ar;
  }
  saveProfileTranslations(profileKey, filtered);
  // A saved string can affect other profiles' pages too (see note above),
  // so rebuild everything rather than just this one profile.
  buildSite();
  return getTranslations(profileKey);
}

module.exports = { updateProfile, getTranslations, saveTranslations };
