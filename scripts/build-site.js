'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_PROFILES_DIR = path.join(ROOT, 'data', 'profiles');
const DATA_INDEX = path.join(ROOT, 'data', 'index.json');
const SITE_DIR = path.join(ROOT, 'site');
const PROFILES_OUT_DIR = path.join(SITE_DIR, 'p');

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initials(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function avatarHtml(photo, name, cssClass) {
  if (photo && photo.embedUrl) {
    return `<img class="${cssClass}" src="${esc(photo.embedUrl)}" alt="${esc(name)}" loading="lazy">`;
  }
  return `<div class="${cssClass === 'avatar' ? 'avatar-fallback' : 'avatar-fallback'}">${esc(initials(name))}</div>`;
}

const CORNER_ORNAMENT_SVG = `
<svg class="corner-ornament" viewBox="0 0 168 168" fill="none" aria-hidden="true">
  <circle cx="84" cy="84" r="82" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <g opacity="0.9" stroke="currentColor" stroke-width="1.2">
    <path d="M84 2 L98 40 L84 78 L70 40 Z"/>
    <path d="M84 166 L98 128 L84 90 L70 128 Z"/>
    <path d="M2 84 L40 70 L78 84 L40 98 Z"/>
    <path d="M166 84 L128 70 L90 84 L128 98 Z"/>
  </g>
</svg>`;

// ---------------------------------------------------------------------------
// Directory page
// ---------------------------------------------------------------------------

function tutorCard(t) {
  const theme = esc(t.theme || 'emerald');
  const tags = (t.tags || []).slice(0, 4);

  return `
  <a href="p/${esc(t.profileKey)}/" class="tutor-card${t.featured ? ' featured' : ''}" data-theme="${theme}"
     data-tutor-card data-name="${esc(t.name)}" data-title="${esc(t.title || '')} ${esc(tags.join(' '))} ${esc(t.location || '')}">
    <div class="card-top">
      ${avatarHtml(t.photo, t.name, 'avatar')}
      <div>
        <h3>${esc(t.name)}</h3>
        ${t.title ? `<p class="title">${esc(t.title)}</p>` : ''}
        ${t.location ? `<p class="title">${esc(t.location)}</p>` : ''}
      </div>
    </div>
    ${t.featured ? '<span class="featured-mark">Featured tutor</span>' : ''}
    ${t.summary ? `<p class="summary">${esc(t.summary)}</p>` : ''}
    ${tags.length ? `<div class="tag-row">${tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}</div>` : ''}
  </a>`;
}

function renderDirectory(directory) {
  const sorted = [...directory.profiles].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Profile Directory</title>
<link rel="stylesheet" href="assets/styles.css">
</head>
<body data-theme="emerald">
  <header class="topbar">
    <div class="container">
      <a class="brand" href="./">Profile Directory</a>
    </div>
  </header>

  <div class="container">
    <div class="directory-header">
      <h1>Find a tutor or professional</h1>
      <p>Browse profiles with videos, certificates, experience and contact details.</p>
    </div>

    <div class="search-row">
      <input class="search-input" type="text" placeholder="Search by name or title…" data-search-input aria-label="Search tutors by name or title">
      <div class="search-count" data-search-count>${sorted.length} profile${sorted.length === 1 ? '' : 's'}</div>
    </div>

    <div class="tutor-grid">
      ${sorted.map(tutorCard).join('\n')}
    </div>
    <div class="empty-state" data-empty-state style="display:none;">
      No profiles match that search.
    </div>
  </div>

  <footer class="site-footer">Generated ${esc(directory.generatedAt)}</footer>
  <script src="assets/site.js"></script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Profile page
// ---------------------------------------------------------------------------

const CONTACT_ICONS = {
  email: `<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 5.5h15v9h-15z"/><path d="M2.5 5.5l7.5 6 7.5-6"/></svg>`,
  whatsapp: `<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 16.5l1.1-3.2A6.8 6.8 0 1 1 8 15.7z"/><path d="M7.3 7.8c.2-.5.4-.5.6-.5h.5c.2 0 .4 0 .5.4.2.5.6 1.5.6 1.6.1.1.1.3 0 .4-.1.2-.2.3-.3.4-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1.2-.2.6-.7.8-1 .2-.2.4-.2.6-.1l1.5.7c.2.1.4.2.4.3.1.2.1 1-.3 1.5-.4.6-1.4 1.1-2.4 1-.9-.1-2.9-.9-4.4-2.4-1.8-1.8-2.5-3.4-2.6-3.7-.1-.2-.7-1.1-.7-2 0-1 .5-1.4.7-1.7z"/></svg>`,
  phone: `<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.5 3.5c-1.5 0-3 1.5-3 3 0 5.5 5.5 11 11 11 1.5 0 3-1.5 3-3 0-.4-.2-.7-.5-.9l-3-2a1 1 0 0 0-1.2.1l-1 1c-1.5-.8-3-2.3-3.8-3.8l1-1a1 1 0 0 0 .1-1.2l-2-3c-.2-.3-.5-.5-.9-.5z"/></svg>`,
  telegram: `<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 10.2l14.6-6c.6-.2 1.1.3.9.9l-2.5 12.1c-.2.7-.9.9-1.4.5l-3.6-2.8-2 2c-.3.3-.7.1-.7-.3l.2-3.5 7.8-7.6-9.1 6.3-4.2-1.4c-.7-.2-.7-1-0-1.2z"/></svg>`,
  facebook: `<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12.5 6.5h-2c-.8 0-1 .4-1 1v2h3l-.4 3h-2.6v6h-3v-6H4.5v-3h1.9V7c0-2 1-3.5 3.4-3.5h2.7z"/></svg>`,
  instagram: `<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="14" height="14" rx="4"/><circle cx="10" cy="10" r="3.2"/><circle cx="14.2" cy="5.8" r="0.6" fill="currentColor" stroke="none"/></svg>`,
  linkedin: `<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M7 8.5v5.5M7 6.3v.1M10.3 14v-3.2c0-1.2.7-1.8 1.7-1.8 1 0 1.5.6 1.5 1.8V14"/></svg>`,
  github: `<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7.5 16.5c-3 1-3.5-1.5-4.5-2m9 4v-2.8c0-.8-.1-1.1-.5-1.5 2-.2 4-1 4-4.4 0-.9-.3-1.7-.9-2.3.3-.8.2-1.7-.1-2.4 0 0-.7-.2-2.4.9a8 8 0 0 0-4.2 0C6.2 4 5.5 4.2 5.5 4.2c-.3.7-.4 1.6-.1 2.4-.6.6-.9 1.4-.9 2.3 0 3.4 2 4.2 4 4.4-.3.3-.4.7-.5 1.2V18"/></svg>`,
  website: `<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="7"/><path d="M3 10h14M10 3c1.8 2 1.8 12 0 14M10 3c-1.8 2-1.8 12 0 14"/></svg>`,
};

function contactChips(contacts) {
  if (!contacts) return '';
  const map = [
    ['email', (v) => `mailto:${v}`, 'Email'],
    ['whatsapp', (v) => `https://wa.me/${v.replace(/[^\d]/g, '')}`, 'WhatsApp'],
    ['phone', (v) => `tel:${v}`, 'Phone'],
    ['telegram', (v) => `https://t.me/${v.replace(/^@/, '')}`, 'Telegram'],
    ['facebook', (v) => v, 'Facebook'],
    ['instagram', (v) => v, 'Instagram'],
    ['linkedin', (v) => v, 'LinkedIn'],
    ['github', (v) => v, 'GitHub'],
    ['website', (v) => v, 'Website'],
  ];
  const chips = map
    .filter(([key]) => contacts[key])
    .map(([key, hrefFn, label]) => `<a class="contact-chip" href="${esc(hrefFn(contacts[key]))}" target="_blank" rel="noopener">${CONTACT_ICONS[key]}<span>${label}</span></a>`);
  if (!chips.length) return '';
  return `<div class="contact-row">${chips.join('')}</div>`;
}

function teachingProfileSection(teaching) {
  const groups = [
    ['Specializations', teaching.specializations],
    ['Age Groups', teaching.ageGroups],
    ['Levels', teaching.levels],
    ['Format', teaching.format],
  ].filter(([, list]) => list && list.length);
  if (!groups.length && !teaching.availability) return '';

  return `
  <section class="profile-section">
    <h2>Teaching Profile</h2>
    ${groups.map(([label, list]) => `
    <div class="teaching-group">
      <h3 class="group-label">${esc(label)}</h3>
      <div class="pill-list">${list.map((x) => `<span class="pill">${esc(x)}</span>`).join('')}</div>
    </div>`).join('')}
    ${teaching.availability ? `<p style="margin-top:16px;">${esc(teaching.availability)}</p>` : ''}
  </section>`;
}

function experienceSection(teaching) {
  if (!teaching.experienceYears && !teaching.experienceDescription) return '';
  return `
  <section class="profile-section">
    <h2>Teaching Experience</h2>
    ${teaching.experienceYears ? `<p><strong>${esc(teaching.experienceYears)} years</strong> of teaching experience.</p>` : ''}
    ${teaching.experienceDescription ? `<p>${esc(teaching.experienceDescription)}</p>` : ''}
  </section>`;
}

function philosophySection(teaching) {
  if (!teaching.philosophy) return '';
  return `
  <section class="profile-section">
    <h2>Teaching Philosophy</h2>
    <p class="philosophy-quote">${esc(teaching.philosophy)}</p>
  </section>`;
}

function languagesSection(languages) {
  if (!languages || !languages.length) return '';
  return `
  <section class="profile-section">
    <h2>Languages</h2>
    <ul class="lang-list">
      ${languages.map((l) => `<li><span>${esc(l.language)}</span>${l.proficiency ? `<span class="level">${esc(l.proficiency)}</span>` : ''}</li>`).join('')}
    </ul>
  </section>`;
}

function skillsSection(skills) {
  if (!skills || !skills.length) return '';
  return `
  <section class="profile-section">
    <h2>Technical Skills</h2>
    <div class="pill-list">${skills.map((s) => `<span class="pill">${esc(s)}</span>`).join('')}</div>
  </section>`;
}

function videosSection(videos) {
  if (!videos || !videos.length) return '';
  return `
  <section class="profile-section">
    <h2>Videos</h2>
    <div class="video-grid">
      ${videos.map((v) => `
      <div class="video-item">
        <div class="frame"><iframe src="${esc(v.embedUrl)}" title="${esc(v.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>
        <h3>${esc(v.title)}</h3>
        ${v.description ? `<p>${esc(v.description)}</p>` : ''}
      </div>`).join('')}
    </div>
  </section>`;
}

function certificatesSection(certificates) {
  if (!certificates || !certificates.length) return '';
  const cards = certificates.map((c) => {
    const hasFile = !!(c.file && c.file.embedUrl);
    const kind = c.file && c.file.provider === 'drive' ? 'file' : 'image';
    return `
      <button type="button" class="cert-card" ${hasFile ? `data-cert-card data-name="${esc(c.name)}" data-embed-url="${esc(c.file.embedUrl)}" data-embed-kind="${kind}"` : 'disabled'}>
        <h3>${esc(c.name)}</h3>
        ${c.organization ? `<p class="org">${esc(c.organization)}</p>` : ''}
        ${c.date ? `<p class="date">${esc(c.date)}</p>` : ''}
        ${hasFile ? '<p class="view-hint">View certificate</p>' : ''}
      </button>
    `;
  }).join('');

  return `
  <section class="profile-section">
    <h2>Certificates</h2>
    <div class="cert-grid" data-cert-section>
      ${cards}
    </div>
  </section>

  <div class="cert-modal-backdrop" data-cert-modal-backdrop>
    <div class="cert-modal">
      <div class="cert-modal-head">
        <h3 data-cert-modal-title></h3>
        <button type="button" class="cert-modal-close" data-cert-modal-close aria-label="Close">&times;</button>
      </div>
      <div class="cert-modal-body" data-cert-modal-body></div>
    </div>
  </div>`;
}

function contactSection(contacts) {
  const chips = contactChips(contacts);
  if (!chips) return '';
  return `
  <section class="profile-section">
    <h2>Contact</h2>
    ${chips}
  </section>`;
}


// ---------------------------------------------------------------------------
// Professional-kind sections
// ---------------------------------------------------------------------------

function metaLine(t) {
  const bits = [t.personal.specialization, t.personal.location].filter(Boolean);
  if (!bits.length) return '';
  return `<p class="meta-line">${bits.map((b) => `<span>${esc(b)}</span>`).join('')}</p>`;
}

function pillSection(heading, items) {
  if (!items || !items.length) return '';
  return `
  <section class="profile-section">
    <h2>${esc(heading)}</h2>
    <div class="pill-list">${items.map((x) => `<span class="pill">${esc(x)}</span>`).join('')}</div>
  </section>`;
}

function professionalOverviewSection(p) {
  const pro = p.professional || {};
  if (!pro.experienceYears && !pro.experienceSummary) return '';
  return `
  <section class="profile-section">
    <h2>Professional Overview</h2>
    ${pro.experienceYears ? `<p><strong>${esc(pro.experienceYears)} years</strong> of professional experience.</p>` : ''}
    ${pro.experienceSummary ? `<p>${esc(pro.experienceSummary)}</p>` : ''}
  </section>`;
}

function workExperienceSection(pro) {
  const items = (pro && pro.workExperience) || [];
  if (!items.length) return '';
  return `
  <section class="profile-section">
    <h2>Work Experience</h2>
    ${items.map((w) => `
    <div class="entry">
      ${w.position ? `<h3>${esc(w.position)}</h3>` : ''}
      ${(w.organization || w.period) ? `<p class="entry-meta">${w.organization ? `<span class="entry-org">${esc(w.organization)}</span>` : ''}${w.organization && w.period ? ' · ' : ''}${w.period ? esc(w.period) : ''}</p>` : ''}
      ${w.description ? `<p class="entry-desc">${esc(w.description)}</p>` : ''}
    </div>`).join('')}
  </section>`;
}

function projectsSection(pro) {
  const items = (pro && pro.projects) || [];
  if (!items.length) return '';
  return `
  <section class="profile-section">
    <h2>Projects &amp; Portfolio</h2>
    <div class="project-grid">
      ${items.map((x) => `
      <div class="project-card">
        ${x.name ? `<h3>${esc(x.name)}</h3>` : ''}
        ${x.description ? `<p>${esc(x.description)}</p>` : ''}
      </div>`).join('')}
    </div>
  </section>`;
}

function educationSection(edu) {
  if (!edu) return '';
  const hasMain = edu.qualification || edu.institution || edu.graduationYear;
  const extra = edu.additional || [];
  if (!hasMain && !extra.length) return '';
  return `
  <section class="profile-section">
    <h2>Education &amp; Qualifications</h2>
    ${hasMain ? `
    <div class="edu-block">
      ${edu.qualification ? `<h3>${esc(edu.qualification)}</h3>` : ''}
      ${(edu.institution || edu.graduationYear) ? `<p class="entry-meta">${edu.institution ? `<span class="entry-org">${esc(edu.institution)}</span>` : ''}${edu.institution && edu.graduationYear ? ' · ' : ''}${edu.graduationYear ? esc(edu.graduationYear) : ''}</p>` : ''}
    </div>` : ''}
    ${extra.length ? `<ul class="plain-list">${extra.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  </section>`;
}

function renderProfile(t) {
  const theme = esc(t.personal.theme || 'emerald');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(t.personal.name)}${t.personal.title ? ' — ' + esc(t.personal.title) : ''}</title>
<link rel="stylesheet" href="../../assets/styles.css">
</head>
<body data-theme="${theme}">
  <header class="topbar">
    <div class="container">
      <a class="brand" href="../../">Profile Directory</a>
    </div>
  </header>

  <div class="profile-wrap">
    <div class="profile-header">
      <div class="photo-frame">
        ${CORNER_ORNAMENT_SVG}
        ${avatarHtml(t.personal.photo, t.personal.name, 'avatar')}
      </div>
      <h1>${esc(t.personal.name)}</h1>
      ${t.personal.title ? `<p class="title">${esc(t.personal.title)}</p>` : ''}
      ${metaLine(t)}
      ${t.personal.summary ? `<p class="summary">${esc(t.personal.summary)}</p>` : ''}
    </div>

    ${t.kind === 'professional' ? `
      ${professionalOverviewSection(t)}
      ${pillSection('Areas of Expertise', t.professional && t.professional.expertise)}
      ${videosSection(t.videos)}
      ${workExperienceSection(t.professional)}
      ${projectsSection(t.professional)}
      ${educationSection(t.education)}
      ${pillSection('Software & Tools', t.professional && t.professional.tools)}
      ${languagesSection(t.languages)}
      ${certificatesSection(t.certificates)}
    ` : `
      ${teachingProfileSection(t.teaching)}
      ${videosSection(t.videos)}
      ${experienceSection(t.teaching)}
      ${languagesSection(t.languages)}
      ${pillSection('Technical Skills', t.skills)}
      ${philosophySection(t.teaching)}
      ${certificatesSection(t.certificates)}
    `}
    ${contactSection(t.contacts)}
  </div>

  <footer class="site-footer">${esc(t.personal.name)} — Tutor Directory</footer>
  <script src="../../assets/site.js"></script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  if (!fs.existsSync(DATA_INDEX)) {
    console.error('Missing data/index.json — run scripts/sync.js first.');
    process.exit(1);
  }

  fs.mkdirSync(PROFILES_OUT_DIR, { recursive: true });

  const directory = JSON.parse(fs.readFileSync(DATA_INDEX, 'utf8'));
  fs.writeFileSync(path.join(SITE_DIR, 'index.html'), renderDirectory(directory));

  const files = fs.readdirSync(DATA_PROFILES_DIR).filter((f) => f.endsWith('.json'));
  let count = 0;
  for (const file of files) {
    const tutor = JSON.parse(fs.readFileSync(path.join(DATA_PROFILES_DIR, file), 'utf8'));
    const outDir = path.join(PROFILES_OUT_DIR, tutor.profileKey);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), renderProfile(tutor));
    count++;
  }

  console.log(`Built directory page + ${count} profile page(s) into ${SITE_DIR}`);
}

main();
