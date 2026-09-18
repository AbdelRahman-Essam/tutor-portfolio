'use strict';
const fs = require('fs');
const path = require('path');
const { resolveTheme } = require('./lib/theme-color');
const { S } = require('./lib/i18n');
const { localizeProfile, localizeDirectoryEntry } = require('./lib/localize');

const ROOT = path.join(__dirname, '..');
const DATA_PROFILES_DIR = path.join(ROOT, 'data', 'profiles');
const DATA_INDEX = path.join(ROOT, 'data', 'index.json');
const TRANSLATIONS_FILE = path.join(ROOT, 'data', 'translations', 'ar.json');
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
  return `<div class="avatar-fallback">${esc(initials(name))}</div>`;
}

const CORNER_ORNAMENT_SVG = ''; // retired along with the circular photo crop (see git history if wanted back)

// Builds the data-theme attribute plus, for words outside the curated CSS
// themes (see scripts/lib/theme-color.js), an inline style setting --accent
// / --accent-tint directly — so any word typed into "Preferred Profile
// Theme" in the sheet produces its own color, not just the 7 built-in ones.
function themeAttrs(rawTheme) {
  const { slug, accent, tint } = resolveTheme(rawTheme);
  const style = accent ? ` style="--accent:${accent};--accent-tint:${tint};"` : '';
  return ` data-theme="${esc(slug)}"${style}`;
}

// The EN/Arabic switcher in the topbar. This is now two plain static links
// between two pre-built pages — no runtime translation, nothing loaded from
// Google, nothing that can mistranslate a name. `hrefs.en`/`hrefs.ar` is '#'
// for whichever language the current page already is (rendered as inert),
// and a relative link to the other language's version of this same page.
function langSwitch(lang, hrefs) {
  const enPart = lang === 'en'
    ? `<span class="lang-btn active">EN</span>`
    : `<a class="lang-btn" href="${esc(hrefs.en)}">EN</a>`;
  const arPart = lang === 'ar'
    ? `<span class="lang-btn active">العربية</span>`
    : `<a class="lang-btn" href="${esc(hrefs.ar)}">العربية</a>`;
  return `<div class="lang-switch">${enPart}${arPart}</div>`;
}

// Relative paths differ depending on which language page we're building and
// how deep it sits (site/, site/ar/, site/p/<key>/, site/p/<key>/ar/).
function directoryCtx(lang) {
  return lang === 'ar'
    ? { assetsBase: '../assets/', brandHref: './', langHrefs: { en: '../', ar: '#' }, profileHref: (key) => `../p/${key}/ar/` }
    : { assetsBase: 'assets/', brandHref: './', langHrefs: { en: '#', ar: 'ar/' }, profileHref: (key) => `p/${key}/` };
}
function profileCtx(lang) {
  return lang === 'ar'
    ? { assetsBase: '../../../assets/', brandHref: '../../../ar/', langHrefs: { en: '../', ar: '#' } }
    : { assetsBase: '../../assets/', brandHref: '../../', langHrefs: { en: '#', ar: 'ar/' } };
}

// ---------------------------------------------------------------------------
// Directory page
// ---------------------------------------------------------------------------

function tutorCard(t, lang, profileHref) {
  const tags = (t.tags || []).slice(0, 4);
  const featuredLabel = t.kind === 'professional' ? S(lang, 'featuredProfessional') : S(lang, 'featuredTutor');

  return `
  <a href="${esc(profileHref(t.profileKey))}" class="tutor-card${t.featured ? ' featured' : ''}"${themeAttrs(t.theme)}
     data-tutor-card data-name="${esc(t.name)}" data-title="${esc(t.title || '')} ${esc(tags.join(' '))} ${esc(t.location || '')}">
    <div class="card-top">
      ${avatarHtml(t.photo, t.name, 'avatar')}
      <div>
        <h3>${esc(t.name)}</h3>
        ${t.title ? `<p class="title">${esc(t.title)}</p>` : ''}
        ${t.location ? `<p class="title">${esc(t.location)}</p>` : ''}
      </div>
    </div>
    ${t.featured ? `<span class="featured-mark">${esc(featuredLabel)}</span>` : ''}
    ${t.summary ? `<p class="summary">${esc(t.summary)}</p>` : ''}
    ${tags.length ? `<div class="tag-row">${tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}</div>` : ''}
  </a>`;
}

function renderDirectory(directory, lang, profiles) {
  const ctx = directoryCtx(lang);
  const sorted = [...profiles].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  const dirAttr = lang === 'ar' ? ' dir="rtl"' : '';
  return `<!DOCTYPE html>
<html lang="${lang}"${dirAttr}>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(S(lang, 'brand'))}</title>
<link rel="stylesheet" href="${ctx.assetsBase}styles.css">
</head>
<body data-theme="emerald">
  <header class="topbar">
    <div class="container">
      <a class="brand" href="${esc(ctx.brandHref)}">${esc(S(lang, 'brand'))}</a>
      ${langSwitch(lang, ctx.langHrefs)}
    </div>
  </header>

  <div class="container">
    <div class="directory-header">
      <h1>${esc(S(lang, 'directoryTitle'))}</h1>
      <p>${esc(S(lang, 'directorySubtitle'))}</p>
    </div>

    <div class="search-row">
      <input class="search-input" type="text" placeholder="${esc(S(lang, 'searchPlaceholder'))}" data-search-input aria-label="${esc(S(lang, 'searchPlaceholder'))}">
      <div class="search-count" data-search-count data-count-one="${esc(S(lang, 'profilesCount', 1))}" data-count-other="${esc(S(lang, 'profilesCount', '{n}'))}">${esc(S(lang, 'profilesCount', sorted.length))}</div>
    </div>

    <div class="tutor-grid">
      ${sorted.map((t) => tutorCard(t, lang, ctx.profileHref)).join('\n')}
    </div>
    <div class="empty-state" data-empty-state style="display:none;">
      ${esc(S(lang, 'emptyState'))}
    </div>
  </div>

  <footer class="site-footer">${esc(S(lang, 'generated'))} <bdi>${esc(directory.generatedAt)}</bdi></footer>
  <script src="${ctx.assetsBase}site.js"></script>
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

const CERT_ICONS = {
  file: `<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5.5 2.5h6l3 3v12h-9z"/><path d="M11.5 2.5v3h3"/></svg>`,
  image: `<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="14" height="12" rx="1.5"/><circle cx="7.3" cy="8.3" r="1.2"/><path d="M4 15l4-4 3 3 3-3.5 3 3.5"/></svg>`,
};

function contactChips(contacts, lang) {
  if (!contacts) return '';
  const map = [
    ['email', (v) => `mailto:${v}`, S(lang, 'contactEmail')],
    ['whatsapp', (v) => `https://wa.me/${v.replace(/[^\d]/g, '')}`, S(lang, 'contactWhatsApp')],
    ['phone', (v) => `tel:${v}`, S(lang, 'contactPhone')],
    ['telegram', (v) => `https://t.me/${v.replace(/^@/, '')}`, S(lang, 'contactTelegram')],
    ['facebook', (v) => v, S(lang, 'contactFacebook')],
    ['instagram', (v) => v, S(lang, 'contactInstagram')],
    ['linkedin', (v) => v, S(lang, 'contactLinkedIn')],
    ['github', (v) => v, S(lang, 'contactGitHub')],
    ['website', (v) => v, S(lang, 'contactWebsite')],
  ];
  const chips = map
    .filter(([key]) => contacts[key])
    .map(([key, hrefFn, label]) => `<a class="contact-chip" href="${esc(hrefFn(contacts[key]))}" target="_blank" rel="noopener">${CONTACT_ICONS[key]}<span>${esc(label)}</span></a>`);
  if (!chips.length) return '';
  return `<div class="contact-row">${chips.join('')}</div>`;
}

function teachingProfileSection(teaching, lang) {
  const groups = [
    [S(lang, 'specializations'), teaching.specializations],
    [S(lang, 'ageGroups'), teaching.ageGroups],
    [S(lang, 'levels'), teaching.levels],
    [S(lang, 'format'), teaching.format],
  ].filter(([, list]) => list && list.length);
  if (!groups.length && !teaching.availability) return '';

  return `
  <section class="profile-section">
    <h2>${esc(S(lang, 'teachingProfile'))}</h2>
    ${groups.map(([label, list]) => `
    <div class="teaching-group">
      <h3 class="group-label">${esc(label)}</h3>
      <div class="pill-list">${list.map((x) => `<span class="pill">${esc(x)}</span>`).join('')}</div>
    </div>`).join('')}
    ${teaching.availability ? `<p style="margin-top:16px;">${esc(teaching.availability)}</p>` : ''}
  </section>`;
}

function experienceSection(teaching, lang) {
  if (!teaching.experienceYears && !teaching.experienceDescription) return '';
  return `
  <section class="profile-section">
    <h2>${esc(S(lang, 'teachingExperience'))}</h2>
    ${teaching.experienceYears ? `<p><strong>${esc(teaching.experienceYears)}</strong> ${esc(S(lang, 'ofTeachingExperience'))}</p>` : ''}
    ${teaching.experienceDescription ? `<p>${esc(teaching.experienceDescription)}</p>` : ''}
  </section>`;
}

function philosophySection(teaching, lang) {
  if (!teaching.philosophy) return '';
  return `
  <section class="profile-section">
    <h2>${esc(S(lang, 'teachingPhilosophy'))}</h2>
    <p class="philosophy-quote">${esc(teaching.philosophy)}</p>
  </section>`;
}

function languagesSection(languages, lang) {
  if (!languages || !languages.length) return '';
  return `
  <section class="profile-section">
    <h2>${esc(S(lang, 'languages'))}</h2>
    <ul class="lang-list">
      ${languages.map((l) => `<li><span>${esc(l.language)}</span>${l.proficiency ? `<span class="level">${esc(l.proficiency)}</span>` : ''}</li>`).join('')}
    </ul>
  </section>`;
}

function videosSection(videos, lang) {
  if (!videos || !videos.length) return '';
  return `
  <section class="profile-section">
    <h2>${esc(S(lang, 'videos'))}</h2>
    <div class="video-grid">
      ${videos.map((v) => `
      <div class="video-item">
        <div class="frame" data-provider="${esc(v.provider || '')}"><iframe src="${esc(v.embedUrl)}" title="${esc(v.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>
        <h3>${esc(v.title)}</h3>
        ${v.description ? `<p>${esc(v.description)}</p>` : ''}
      </div>`).join('')}
    </div>
  </section>`;
}

function certificatesSection(certificates, lang) {
  if (!certificates || !certificates.length) return '';
  const cards = certificates.map((c) => {
    const hasFile = !!(c.file && c.file.embedUrl);
    const kind = c.file && c.file.provider === 'drive' ? 'file' : 'image';
    return `
      <button type="button" class="cert-card" ${hasFile ? `data-cert-card data-name="${esc(c.name)}" data-embed-url="${esc(c.file.embedUrl)}" data-embed-kind="${kind}"` : 'disabled'}>
        <span class="cert-icon">${kind === 'file' ? CERT_ICONS.file : CERT_ICONS.image}</span>
        <h3>${esc(c.name)}</h3>
        ${c.organization ? `<p class="org">${esc(c.organization)}</p>` : ''}
        ${c.date ? `<p class="date">${esc(c.date)}</p>` : ''}
        ${hasFile ? `<p class="view-hint">${esc(S(lang, 'viewCertificate'))}</p>` : ''}
      </button>
    `;
  }).join('');

  return `
  <section class="profile-section">
    <h2>${esc(S(lang, 'certificates'))}</h2>
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
      <p class="cert-modal-fallback-tpl" hidden data-fallback-prefix="${esc(S(lang, 'certNotShowing'))}" data-fallback-link="${esc(S(lang, 'openInNewTab'))}"></p>
    </div>
  </div>`;
}

function contactSection(contacts, lang) {
  const chips = contactChips(contacts, lang);
  if (!chips) return '';
  return `
  <section class="profile-section">
    <h2>${esc(S(lang, 'contact'))}</h2>
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

// Real numbers pulled straight from the profile's own data — no scores or
// metrics that aren't actually in the sheet.
function quickFacts(t, lang) {
  const isPro = t.kind === 'professional';
  const expYears = isPro ? (t.professional && t.professional.experienceYears) : (t.teaching && t.teaching.experienceYears);
  const specList = isPro ? (t.professional && t.professional.expertise) : (t.teaching && t.teaching.specializations);

  const facts = [];
  if (expYears) facts.push([expYears, Number(expYears) === 1 ? S(lang, 'statYear') : S(lang, 'statYears')]);
  if (specList && specList.length) facts.push([specList.length, isPro ? S(lang, 'statAreasExpertise') : S(lang, 'statSpecializations')]);
  if (t.languages && t.languages.length) facts.push([t.languages.length, t.languages.length === 1 ? S(lang, 'statLanguage') : S(lang, 'statLanguages')]);
  if (t.certificates && t.certificates.length) facts.push([t.certificates.length, t.certificates.length === 1 ? S(lang, 'statCertificate') : S(lang, 'statCertificates')]);

  if (!facts.length) return '';
  return `
      <div class="stat-row">
        ${facts.slice(0, 4).map(([value, label]) => `<div class="stat-card"><div class="stat-value">${esc(value)}</div><div class="stat-label">${esc(label)}</div></div>`).join('')}
      </div>`;
}

// The single most direct way to reach this person, surfaced as one
// prominent button up top — the full list of every contact method they
// gave still lives in the Contact section further down the page.
function primaryCta(contacts, lang) {
  if (!contacts) return '';
  const order = [
    ['whatsapp', (v) => `https://wa.me/${v.replace(/[^\d]/g, '')}`, S(lang, 'messageWhatsApp')],
    ['email', (v) => `mailto:${v}`, S(lang, 'getInTouch')],
    ['telegram', (v) => `https://t.me/${v.replace(/^@/, '')}`, S(lang, 'messageTelegram')],
    ['phone', (v) => `tel:${v}`, S(lang, 'call')],
  ];
  const hit = order.find(([key]) => contacts[key]);
  if (!hit) return '';
  const [key, hrefFn, label] = hit;
  return `<a class="cta-button" href="${esc(hrefFn(contacts[key]))}" target="_blank" rel="noopener">${CONTACT_ICONS[key] || ''}<span>${esc(label)}</span></a>`;
}

function pillSection(heading, items) {
  if (!items || !items.length) return '';
  return `
  <section class="profile-section">
    <h2>${esc(heading)}</h2>
    <div class="pill-list">${items.map((x) => `<span class="pill">${esc(x)}</span>`).join('')}</div>
  </section>`;
}

function professionalOverviewSection(p, lang) {
  const pro = p.professional || {};
  if (!pro.experienceYears && !pro.experienceSummary) return '';
  return `
  <section class="profile-section">
    <h2>${esc(S(lang, 'professionalOverview'))}</h2>
    ${pro.experienceYears ? `<p><strong>${esc(pro.experienceYears)}</strong> ${esc(S(lang, 'ofProfessionalExperience'))}</p>` : ''}
    ${pro.experienceSummary ? `<p>${esc(pro.experienceSummary)}</p>` : ''}
  </section>`;
}

function workExperienceSection(pro, lang) {
  const items = (pro && pro.workExperience) || [];
  if (!items.length) return '';
  return `
  <section class="profile-section">
    <h2>${esc(S(lang, 'workExperience'))}</h2>
    ${items.map((w) => `
    <div class="entry">
      ${w.position ? `<h3>${esc(w.position)}</h3>` : ''}
      ${(w.organization || w.period) ? `<p class="entry-meta">${w.organization ? `<span class="entry-org">${esc(w.organization)}</span>` : ''}${w.organization && w.period ? ' · ' : ''}${w.period ? esc(w.period) : ''}</p>` : ''}
      ${w.description ? `<p class="entry-desc">${esc(w.description)}</p>` : ''}
    </div>`).join('')}
  </section>`;
}

function projectsSection(pro, lang) {
  const items = (pro && pro.projects) || [];
  if (!items.length) return '';
  return `
  <section class="profile-section">
    <h2>${esc(S(lang, 'projectsPortfolio'))}</h2>
    <div class="project-grid">
      ${items.map((x) => `
      <div class="project-card">
        ${x.name ? `<h3>${esc(x.name)}</h3>` : ''}
        ${x.description ? `<p>${esc(x.description)}</p>` : ''}
      </div>`).join('')}
    </div>
  </section>`;
}

function educationSection(edu, lang) {
  if (!edu) return '';
  const hasMain = edu.qualification || edu.institution || edu.graduationYear;
  const extra = edu.additional || [];
  if (!hasMain && !extra.length) return '';
  return `
  <section class="profile-section">
    <h2>${esc(S(lang, 'educationQualifications'))}</h2>
    ${hasMain ? `
    <div class="edu-block">
      ${edu.qualification ? `<h3>${esc(edu.qualification)}</h3>` : ''}
      ${(edu.institution || edu.graduationYear) ? `<p class="entry-meta">${edu.institution ? `<span class="entry-org">${esc(edu.institution)}</span>` : ''}${edu.institution && edu.graduationYear ? ' · ' : ''}${edu.graduationYear ? esc(edu.graduationYear) : ''}</p>` : ''}
    </div>` : ''}
    ${extra.length ? `<ul class="plain-list">${extra.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  </section>`;
}

// Only appears when the sheet has an "Edit Response Link" (or similar)
// column filled in for this person — see the editLink comment in
// schema.js and the setup steps in SYSTEM_OVERVIEW.md. Self-service editing
// with no login system of our own to build or secure.
function editLinkSection(t, lang) {
  if (!t.personal.editLink) return '';
  return `<p class="edit-profile-link"><a href="${esc(t.personal.editLink)}" target="_blank" rel="noopener">${esc(S(lang, 'editMyProfile'))}</a></p>`;
}

function renderProfile(t, lang) {
  const ctx = profileCtx(lang);
  const dirAttr = lang === 'ar' ? ' dir="rtl"' : '';
  return `<!DOCTYPE html>
<html lang="${lang}"${dirAttr}>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(t.personal.name)}${t.personal.title ? ' — ' + esc(t.personal.title) : ''}</title>
<link rel="stylesheet" href="${ctx.assetsBase}styles.css">
</head>
<body class="profile-body"${themeAttrs(t.personal.theme)}>
  <header class="topbar">
    <div class="container">
      <a class="brand" href="${esc(ctx.brandHref)}">${esc(S(lang, 'brand'))}</a>
      ${langSwitch(lang, ctx.langHrefs)}
    </div>
  </header>

  <div class="profile-wrap">
    <div class="profile-header">
      <div class="profile-cover">
        ${t.featured ? `<span class="cover-ribbon">★ ${esc(t.kind === 'professional' ? S(lang, 'featuredProfessional') : S(lang, 'featuredTutor'))}</span>` : ''}
      </div>
      <div class="photo-frame">
        ${CORNER_ORNAMENT_SVG}
        ${avatarHtml(t.personal.photo, t.personal.name, 'avatar')}
      </div>
      <h1>${esc(t.personal.name)}</h1>
      ${t.personal.title ? `<p class="title">${esc(t.personal.title)}</p>` : ''}
      ${metaLine(t)}
      ${t.personal.summary ? `<p class="summary">${esc(t.personal.summary)}</p>` : ''}
      ${quickFacts(t, lang)}
      ${primaryCta(t.contacts, lang)}
    </div>

    ${t.kind === 'professional' ? `
      ${professionalOverviewSection(t, lang)}
      ${pillSection(S(lang, 'areasOfExpertise'), t.professional && t.professional.expertise)}
      ${videosSection(t.videos, lang)}
      ${workExperienceSection(t.professional, lang)}
      ${projectsSection(t.professional, lang)}
      ${educationSection(t.education, lang)}
      ${pillSection(S(lang, 'softwareTools'), t.professional && t.professional.tools)}
      ${languagesSection(t.languages, lang)}
      ${certificatesSection(t.certificates, lang)}
    ` : `
      ${teachingProfileSection(t.teaching, lang)}
      ${videosSection(t.videos, lang)}
      ${experienceSection(t.teaching, lang)}
      ${languagesSection(t.languages, lang)}
      ${pillSection(S(lang, 'technicalSkills'), t.skills)}
      ${philosophySection(t.teaching, lang)}
      ${certificatesSection(t.certificates, lang)}
    `}
    ${contactSection(t.contacts, lang)}
    ${editLinkSection(t, lang)}
  </div>

  <footer class="site-footer">${esc(t.personal.name)} ${esc(S(lang, 'footerSuffix'))}</footer>
  <script src="${ctx.assetsBase}site.js"></script>
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
  fs.mkdirSync(path.join(SITE_DIR, 'ar'), { recursive: true });

  const directory = JSON.parse(fs.readFileSync(DATA_INDEX, 'utf8'));
  const translations = fs.existsSync(TRANSLATIONS_FILE) ? JSON.parse(fs.readFileSync(TRANSLATIONS_FILE, 'utf8')) : {};

  // English directory (unchanged content) + Arabic directory (each card's
  // title/summary/tags localized from the same per-profile translation
  // entry used on the profile pages, falling back to English per-field).
  fs.writeFileSync(path.join(SITE_DIR, 'index.html'), renderDirectory(directory, 'en', directory.profiles));
  const arProfiles = directory.profiles.map((p) => localizeDirectoryEntry(p, translations[p.profileKey]));
  fs.writeFileSync(path.join(SITE_DIR, 'ar', 'index.html'), renderDirectory(directory, 'ar', arProfiles));

  const files = fs.readdirSync(DATA_PROFILES_DIR).filter((f) => f.endsWith('.json'));
  let count = 0;
  for (const file of files) {
    const tutor = JSON.parse(fs.readFileSync(path.join(DATA_PROFILES_DIR, file), 'utf8'));
    const outDir = path.join(PROFILES_OUT_DIR, tutor.profileKey);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), renderProfile(tutor, 'en'));

    const arOutDir = path.join(outDir, 'ar');
    fs.mkdirSync(arOutDir, { recursive: true });
    const arTutor = localizeProfile(tutor, translations[tutor.profileKey]);
    fs.writeFileSync(path.join(arOutDir, 'index.html'), renderProfile(arTutor, 'ar'));

    count++;
  }

  console.log(`Built directory page (EN+AR) + ${count} profile page(s) (EN+AR) into ${SITE_DIR}`);
}

main();
