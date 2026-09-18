'use strict';

// ---------------------------------------------------------------------------
// Applies a profile's Arabic translation (from data/translations/ar.json)
// on top of its English data. Only known translatable text fields are
// copied over — ids, URLs, dates, photo/video/cert file references are
// always left as-is. Anything the translation file doesn't cover yet is
// simply left in English, so a partially-translated profile still renders
// correctly instead of breaking.
// ---------------------------------------------------------------------------

function pick(obj, keys) {
  const out = {};
  if (!obj) return out;
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

// Arrays (work experience, projects, languages, certificates) are matched
// by position: translation entry [0] overrides base entry [0], etc. This
// assumes the sheet's row order doesn't change out from under a
// translation — reasonable for hand-maintained entries, since reordering
// would need re-checking the translation anyway.
function mergeByIndex(base, overrides) {
  if (!overrides) return base;
  return base.map((item, i) => (overrides[i] ? { ...item, ...overrides[i] } : item));
}

function localizeProfile(t, ar) {
  if (!ar) return t;
  const clone = JSON.parse(JSON.stringify(t));

  if (ar.personal) {
    Object.assign(clone.personal, pick(ar.personal, ['name', 'title', 'summary', 'specialization', 'location']));
  }
  if (ar.teaching && clone.teaching) {
    Object.assign(clone.teaching, pick(ar.teaching, [
      'specializations', 'ageGroups', 'levels', 'format', 'availability', 'experienceDescription', 'philosophy',
    ]));
  }
  if (ar.professional && clone.professional) {
    Object.assign(clone.professional, pick(ar.professional, ['experienceSummary', 'expertise', 'tools']));
    if (ar.professional.workExperience) {
      clone.professional.workExperience = mergeByIndex(clone.professional.workExperience || [], ar.professional.workExperience);
    }
    if (ar.professional.projects) {
      clone.professional.projects = mergeByIndex(clone.professional.projects || [], ar.professional.projects);
    }
  }
  if (ar.education && clone.education) {
    Object.assign(clone.education, pick(ar.education, ['qualification', 'institution', 'additional']));
  }
  if (ar.languages) clone.languages = mergeByIndex(clone.languages || [], ar.languages);
  if (ar.certificates) clone.certificates = mergeByIndex(clone.certificates || [], ar.certificates);

  return clone;
}

// The directory card only shows a slice of a profile (name, title, summary,
// location, a handful of tags) — translate that same slice for the Arabic
// directory listing, pulling from the same per-profile translation entry.
function localizeDirectoryEntry(entry, ar) {
  if (!ar) return entry;
  const clone = { ...entry };
  if (ar.personal) {
    if (ar.personal.name) clone.name = ar.personal.name;
    if (ar.personal.title) clone.title = ar.personal.title;
    if (ar.personal.summary) clone.summary = ar.personal.summary;
    if (ar.personal.location) clone.location = ar.personal.location;
  }
  const tagSource = (ar.teaching && ar.teaching.specializations) || (ar.professional && ar.professional.expertise);
  if (tagSource && entry.tags) clone.tags = tagSource.slice(0, entry.tags.length);
  return clone;
}

module.exports = { localizeProfile, localizeDirectoryEntry };
