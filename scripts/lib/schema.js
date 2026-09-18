'use strict';
const {
  clean, splitList, splitLines, slugify, stableId,
  extractSlots, normalizeMedia,
  parseWorkExperience, parseProjects, parseLanguageLines,
} = require('./parse');

// ---------------------------------------------------------------------------
// shared pieces (identical across both forms)
// ---------------------------------------------------------------------------

const VIDEO_FIELDS = {
  title: /Video.*Title/i,
  type: /Video.*Type/i,
  description: /Video.*Description/i,
  url: /Video.*(URL|Drive|YouTube)/i,
};

const CERT_FIELDS = {
  name: /Certificate.*Name/i,
  organization: /Certificate.*(Issuing|Organization)/i,
  date: /Certificate.*Date/i,
  description: /Certificate.*Description/i,
  file: /Certificate.*File/i,
};

function parseVideos(row, warn) {
  // anchor on the Title column of each video slot
  const slots = extractSlots(row, /^Video(\s+\d+)?\s*—.*Title/i, VIDEO_FIELDS);
  const out = [];
  slots.forEach((s, i) => {
    if (!s.url) return;
    const media = normalizeMedia(s.url, 'video', warn, `Video ${i + 1}`);
    if (!media) return;
    out.push({
      title: s.title || `Video ${i + 1}`,
      type: s.type,
      description: s.description,
      ...media,
    });
  });
  return out;
}

function parseCertificates(row, warn) {
  const slots = extractSlots(row, /^Certificate(\s+\d+)?\s*—.*Name/i, CERT_FIELDS);
  const out = [];
  slots.forEach((s, i) => {
    if (!s.name && !s.file) return;
    const file = s.file ? normalizeMedia(s.file, 'file', warn, `Certificate ${i + 1}`) : undefined;
    out.push({
      name: s.name || `Certificate ${i + 1}`,
      organization: s.organization,
      date: s.date,
      description: s.description,
      file,
    });
  });
  return out;
}

function parseContacts(row) {
  const c = {
    email: row.get('Professional Email'),
    whatsapp: row.get('WhatsApp Number'),
    phone: row.get('Phone Number'),
    telegram: row.get('Telegram'),
    facebook: row.get('Facebook'),
    instagram: row.get('Instagram'),
    linkedin: row.get('LinkedIn'),
    github: row.get('Github') || row.get('GitHub'),
    website: row.get('Personal Website'),
  };
  Object.keys(c).forEach((k) => c[k] === undefined && delete c[k]);
  return c;
}

function commonFields(row, warn) {
  const name = row.get('Full Name');
  const photo = normalizeMedia(row.get('Profile Photo'), 'image', warn, 'Profile photo');

  return {
    name,
    photo,
    title: row.get('Professional Title'),
    summary: row.get('Professional Summary'),
    // theme is slugified so "Deep Blue" -> "deep-blue" matches the CSS token
    theme: slugify(row.get('Preferred Profile Theme') || 'emerald'),
    preferredKey: row.get('Preferred Profile Key'),
    visibility: (row.get('Profile Visibility') || 'Unlisted').toLowerCase(),
    email: row.get('Email Address'),
    timestamp: row.get('Timestamp'),
    // Optional: the "Edit your response" link Google Forms shows a person
    // right after they submit (Settings > Responses > "Edit after submit").
    // If the sheet owner adds a column for it and pastes each person's link
    // in, an "Edit my profile" button appears on their page — this is how
    // someone updates their own info or adds a new video/photo (Drive
    // upload questions save straight to Drive, same as at signup) without
    // any login system of ours. See SYSTEM_OVERVIEW.md for full setup.
    editLink: row.get('Edit Response Link') || row.get('Profile Edit Link') || row.get('Edit Link'),
    videos: parseVideos(row, warn),
    certificates: parseCertificates(row, warn),
    contacts: parseContacts(row),
  };
}

// ---------------------------------------------------------------------------
// Schema: TUTOR  (the original Islamic-English tutor form)
// ---------------------------------------------------------------------------

const tutorSchema = {
  kind: 'tutor',
  detect: (headers) =>
    headers.some((h) => /Teaching Specializations/i.test(h)) ||
    headers.some((h) => /Student Age Groups/i.test(h)),

  map(row, warn) {
    const base = commonFields(row, warn);

    const languages = [];
    const spoken = splitList(row.get('Languages You Can Communicate/Teach In'));
    const englishLevel = row.get('English Proficiency');
    if (spoken.some((l) => /^english$/i.test(l)) && englishLevel) {
      languages.push({ language: 'English', proficiency: englishLevel });
    }
    for (const entry of parseLanguageLines(row.get('Other Language Proficiency'))) {
      if (!languages.some((l) => l.language.toLowerCase() === entry.language.toLowerCase())) {
        languages.push(entry);
      }
    }
    for (const lang of spoken) {
      if (!languages.some((l) => l.language.toLowerCase() === lang.toLowerCase())) {
        languages.push({ language: lang });
      }
    }

    return {
      ...base,
      teaching: {
        specializations: splitList(row.get('Teaching Specializations')),
        ageGroups: splitList(row.get('Student Age Groups')),
        levels: splitList(row.get('Student Levels')),
        format: splitList(row.get('Teaching Format')),
        availability: row.get('Current Availability'),
        experienceYears: row.get('Years of Teaching Experience'),
        experienceDescription: row.get('Teaching Experience'),
        philosophy: row.get('Teaching Philosophy'),
      },
      skills: splitList(row.get('Teaching & Technology Skills')),
      languages,
    };
  },
};

// ---------------------------------------------------------------------------
// Schema: PROFESSIONAL  (the engineering / general career form)
// ---------------------------------------------------------------------------

const professionalSchema = {
  kind: 'professional',
  detect: (headers) =>
    headers.some((h) => /Profession \/ Career Field/i.test(h)) ||
    headers.some((h) => /Areas of Expertise/i.test(h)) ||
    headers.some((h) => /Projects & Portfolio/i.test(h)),

  map(row, warn) {
    const base = commonFields(row, warn);

    return {
      ...base,
      professional: {
        field: row.get('Profession / Career Field'),
        specialization: row.get('Specialization'),
        location: row.get('Location'),
        experienceYears: row.get('Years of Experience'),
        experienceSummary: row.get('Professional Experience'),
        expertise: splitList(row.get('Areas of Expertise ( Professional Skills)') || row.get('Areas of Expertise')),
        tools: splitList(row.get('Software / Tools')),
        workExperience: parseWorkExperience(row.get('Work Experience')),
        projects: parseProjects(row.get('Projects & Portfolio')),
      },
      education: {
        qualification: row.get('Highest Qualification'),
        institution: row.get('Institution'),
        graduationYear: row.get('Graduation Year'),
        additional: splitLines(row.get('Additional Qualifications')),
      },
      skills: splitList(row.get('Software / Tools')),
      languages: parseLanguageLines(row.get('Languages')),
    };
  },
};

const SCHEMAS = [tutorSchema, professionalSchema];

function detectSchema(headers) {
  return SCHEMAS.find((s) => s.detect(headers)) || null;
}

// ---------------------------------------------------------------------------
// unified profile assembly
// ---------------------------------------------------------------------------

function buildProfile(row, schema, ctx) {
  const warn = (msg) => ctx.warnings.push(`[${ctx.file}] ${msg}`);
  const mapped = schema.map(row, warn);

  if (!mapped.name) {
    warn('Row skipped: missing Full Name.');
    return null;
  }

  // Admin "Profile Key" column (if the admin filled it in) wins over the
  // submitter's "Preferred Profile Key", which wins over the slugified name.
  const adminKey = row.has('Profile Key') ? row.get('Profile Key') : undefined;
  let profileKey = slugify(adminKey || mapped.preferredKey || mapped.name);
  if (!profileKey) {
    warn(`Row skipped: could not derive a profile key for "${mapped.name}".`);
    return null;
  }
  if (ctx.usedKeys.has(profileKey)) {
    const original = profileKey;
    let n = 2;
    while (ctx.usedKeys.has(`${original}-${n}`)) n++;
    profileKey = `${original}-${n}`;
    warn(`Duplicate profile key "${original}" for "${mapped.name}" — renamed to "${profileKey}". Set "Preferred Profile Key" in the sheet to control this.`);
  }
  ctx.usedKeys.add(profileKey);

  // Status/Featured are admin columns. If the sheet has no Status column at
  // all (the professional form currently doesn't), default to Approved so the
  // profile still publishes — but warn, since that means no approval gate.
  const hasStatusCol = row.has('Status');
  const status = hasStatusCol ? (row.get('Status') || 'Pending') : 'Approved';
  if (!hasStatusCol && !ctx.warnedNoStatus) {
    warn('No "Status" column found — every row is treated as Approved. Add Status/Featured/Admin Notes columns to gate publishing.');
    ctx.warnedNoStatus = true;
  }

  const profile = {
    id: stableId([mapped.email, mapped.name, mapped.timestamp]),
    profileKey,
    kind: schema.kind,
    status,
    visibility: mapped.visibility,
    featured: /^y(es)?$/i.test(row.get('Featured') || ''),

    personal: {
      name: mapped.name,
      title: mapped.title,
      photo: mapped.photo,
      summary: mapped.summary,
      theme: mapped.theme,
      location: mapped.professional ? mapped.professional.location : undefined,
      field: mapped.professional ? mapped.professional.field : undefined,
      specialization: mapped.professional ? mapped.professional.specialization : undefined,
    },

    teaching: mapped.teaching,
    professional: mapped.professional,
    education: mapped.education,
    languages: mapped.languages,
    skills: mapped.skills,
    videos: mapped.videos,
    certificates: mapped.certificates,
    contacts: mapped.contacts,

    _admin: {
      sourceFile: ctx.file,
      submittedAt: mapped.timestamp,
      notes: row.get('Admin Notes'),
    },
  };

  return pruneEmpty(profile);
}

/** Recursively drops undefined values, empty strings, empty arrays and empty objects. */
function pruneEmpty(value) {
  if (Array.isArray(value)) {
    const arr = value.map(pruneEmpty).filter((v) => v !== undefined);
    return arr.length ? arr : undefined;
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const pruned = pruneEmpty(v);
      if (pruned !== undefined) out[k] = pruned;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (typeof value === 'string') return value.trim() === '' ? undefined : value;
  if (value === undefined || value === null) return undefined;
  return value;
}

module.exports = { detectSchema, buildProfile, SCHEMAS };
