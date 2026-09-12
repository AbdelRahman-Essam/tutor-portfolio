'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_TUTORS_DIR = path.join(ROOT, 'data', 'tutors');
const DATA_INDEX = path.join(ROOT, 'data', 'index.json');
const SITE_DIR = path.join(ROOT, 'site');
const TUTORS_OUT_DIR = path.join(SITE_DIR, 'tutors');

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
  const tags = [
    ...(t.specializations || []).slice(0, 2),
    ...(t.ageGroups || []),
  ].slice(0, 4);

  return `
  <a href="tutors/${esc(t.profileKey)}/" class="tutor-card${t.featured ? ' featured' : ''}" data-theme="${theme}"
     data-tutor-card data-name="${esc(t.name)}" data-title="${esc(t.title || '')}">
    <div class="card-top">
      ${avatarHtml(t.photo, t.name, 'avatar')}
      <div>
        <h3>${esc(t.name)}</h3>
        ${t.title ? `<p class="title">${esc(t.title)}</p>` : ''}
      </div>
    </div>
    ${t.featured ? '<span class="featured-mark">Featured tutor</span>' : ''}
    ${t.summary ? `<p class="summary">${esc(t.summary)}</p>` : ''}
    ${tags.length ? `<div class="tag-row">${tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}</div>` : ''}
  </a>`;
}

function renderDirectory(directory) {
  const sorted = [...directory.tutors].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tutor Directory</title>
<link rel="stylesheet" href="assets/styles.css">
</head>
<body data-theme="emerald">
  <header class="topbar">
    <div class="container">
      <a class="brand" href="./">Tutor Directory</a>
    </div>
  </header>

  <div class="container">
    <div class="directory-header">
      <h1>Find an English &amp; Islamic Studies tutor</h1>
      <p>Browse tutor profiles with teaching videos, certificates, and contact details.</p>
    </div>

    <div class="search-row">
      <input class="search-input" type="text" placeholder="Search by name or title…" data-search-input aria-label="Search tutors by name or title">
      <div class="search-count" data-search-count>${sorted.length} tutor${sorted.length === 1 ? '' : 's'}</div>
    </div>

    <div class="tutor-grid">
      ${sorted.map(tutorCard).join('\n')}
    </div>
    <div class="empty-state" data-empty-state style="display:none;">
      No tutors match that search.
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
  const cards = certificates.map((c, i) => {
    const panelId = `cert-panel-${i}`;
    const hasFile = !!(c.file && c.file.embedUrl);
    const kind = c.file && c.file.provider === 'drive' ? 'iframe' : 'image';
    return `
      <button type="button" class="cert-card" ${hasFile ? `data-cert-card data-panel-id="${panelId}" data-name="${esc(c.name)}" data-embed-url="${esc(c.file.embedUrl)}" data-embed-kind="${kind === 'iframe' ? 'file' : 'image'}"` : 'disabled'}>
        <h3>${esc(c.name)}</h3>
        ${c.organization ? `<p class="org">${esc(c.organization)}</p>` : ''}
        ${c.date ? `<p class="date">${esc(c.date)}</p>` : ''}
        ${hasFile ? '<p class="view-hint">View certificate</p>' : ''}
      </button>
      ${hasFile ? `<div class="cert-inline-panel" id="${panelId}"><iframe src="${esc(c.file.embedUrl)}" title="${esc(c.name)}" loading="lazy"></iframe></div>` : ''}
    `;
  }).join('');

  return `
  <section class="profile-section">
    <h2>Certificates</h2>
    <div class="cert-mode-toggle" data-cert-mode-toggle>
      <button type="button" data-mode="inline" class="active">Inline preview</button>
      <button type="button" data-mode="modal">Lightbox</button>
    </div>
    <p class="cert-mode-note">Demo toggle for deciding the display style — pick one and this note/toggle goes away.</p>
    <div class="cert-grid" data-cert-section data-mode="inline">
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
      <a class="brand" href="../../">Tutor Directory</a>
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
      ${t.personal.summary ? `<p class="summary">${esc(t.personal.summary)}</p>` : ''}
    </div>

    ${teachingProfileSection(t.teaching)}
    ${videosSection(t.videos)}
    ${experienceSection(t.teaching)}
    ${languagesSection(t.languages)}
    ${skillsSection(t.technicalSkills)}
    ${philosophySection(t.teaching)}
    ${certificatesSection(t.certificates)}
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

  fs.mkdirSync(TUTORS_OUT_DIR, { recursive: true });

  const directory = JSON.parse(fs.readFileSync(DATA_INDEX, 'utf8'));
  fs.writeFileSync(path.join(SITE_DIR, 'index.html'), renderDirectory(directory));

  const files = fs.readdirSync(DATA_TUTORS_DIR).filter((f) => f.endsWith('.json'));
  let count = 0;
  for (const file of files) {
    const tutor = JSON.parse(fs.readFileSync(path.join(DATA_TUTORS_DIR, file), 'utf8'));
    const outDir = path.join(TUTORS_OUT_DIR, tutor.profileKey);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), renderProfile(tutor));
    count++;
  }

  console.log(`Built directory page + ${count} tutor profile page(s) into ${SITE_DIR}`);
}

main();
