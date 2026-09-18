'use strict';
const fs = require('fs');
const path = require('path');
const { resolveTheme } = require('./lib/theme-color');
const { loadDictionary } = require('./lib/i18n');

const ROOT = path.join(__dirname, '..');
const DATA_PROFILES_DIR = path.join(ROOT, 'data', 'profiles');
const DATA_INDEX = path.join(ROOT, 'data', 'index.json');
const SITE_DIR = path.join(ROOT, 'site');
const PROFILES_OUT_DIR = path.join(SITE_DIR, 'p');

// English -> Arabic dictionary, loaded once (static UI strings + every
// data/i18n/<profileKey>.json produced by scripts/translate.js). See
// scripts/lib/i18n.js. Populated by main()/renderAll() before any page is
// rendered; bi() below reads from it.
let DICT = {};

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Renders a piece of user-facing text as a pair of spans, one per language,
// with the inactive one hidden by CSS (see the `[data-i18n-en]`/
// `[data-i18n-ar]` rules in styles.css) and flipped instantly, client-side,
// by the EN/AR toggle in site.js — no reload, no external translate call.
// The Arabic text comes from DICT, which is the static UI_AR table below
// merged with every stored data/i18n/<profileKey>.json (see
// scripts/lib/i18n.js and scripts/translate.js). Falls back to the English
// text when a translation hasn't been generated yet, so the page never
// renders blank while translations are still catching up.
function bi(text) {
  const en = text == null ? '' : String(text).trim();
  if (!en) return '';
  const ar = DICT[en];
  return `<span data-i18n-en>${esc(en)}</span><span data-i18n-ar dir="rtl">${esc(ar || en)}</span>`;
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

// Small EN/Arabic switcher in the topbar. Every page ships both languages
// already baked in (see bi() above); this just flips which one is visible
// (initLangSwitch() in site.js), instantly and with no network call. Every
// page also carries a tiny inline script, right after <meta charset>, that
// applies the saved choice before first paint so there's no EN-then-AR
// flash on load.
function langSwitch() {
  return `
    <div class="lang-switch" data-lang-switch>
      <button type="button" class="lang-btn" data-lang-btn="en">EN</button>
      <button type="button" class="lang-btn" data-lang-btn="ar">العربية</button>
    </div>`;
}

// Reads the visitor's saved language (site.js writes it to localStorage)
// and sets it on <html> immediately, before the rest of the page paints.
const LANG_PREINIT = `<script>(function(){try{if(localStorage.getItem('siteLang')==='ar'){var h=document.documentElement;h.setAttribute('data-lang','ar');h.setAttribute('dir','rtl');h.setAttribute('lang','ar');}}catch(e){}})();</script>`;

// Static, hand-written translations for the chrome around the data — section
// headings, buttons, labels — that's identical on every page and doesn't
// need the per-profile translation pipeline in scripts/translate.js. Keyed
// by the exact English string used at each call site below.
const UI_AR = {
  'Profile Directory': 'دليل الملفات الشخصية',
  'Find a tutor or professional': 'اطلب معلمًا أو متخصصًا',
  'Browse profiles with videos, certificates, experience and contact details.': 'تصفح الملفات الشخصية بالفيديوهات والشهادات والخبرات وبيانات التواصل.',
  'Search by name or title…': 'ابحث بالاسم أو المسمى الوظيفي…',
  'No profiles match that search.': 'لا توجد ملفات مطابقة لهذا البحث.',
  'Generated': 'تاريخ الإنشاء',
  'Featured tutor': 'معلم مميز',
  'Featured professional': 'متخصص مميز',
  'Year experience': 'سنة خبرة',
  'Years experience': 'سنوات خبرة',
  'Specializations': 'التخصصات',
  'Areas of expertise': 'مجالات الخبرة',
  'Areas of Expertise': 'مجالات الخبرة',
  'Language': 'لغة',
  'Languages': 'اللغات',
  'Certificate': 'شهادة',
  'Certificates': 'الشهادات',
  'Teaching Profile': 'الملف التدريسي',
  'Age Groups': 'الفئات العمرية',
  'Levels': 'المستويات',
  'Format': 'طريقة التدريس',
  'Teaching Experience': 'الخبرة التدريسية',
  'Teaching Philosophy': 'فلسفة التدريس',
  'Videos': 'مقاطع الفيديو',
  'Technical Skills': 'المهارات التقنية',
  'Contact': 'التواصل',
  'Professional Overview': 'نبذة مهنية',
  'Work Experience': 'الخبرة العملية',
  'Projects & Portfolio': 'المشاريع وأعمال سابقة',
  'Education & Qualifications': 'التعليم والمؤهلات',
  'Software & Tools': 'البرامج والأدوات',
  'Get in touch': 'تواصل معي',
  'Message on WhatsApp': 'راسلني على واتساب',
  'Message on Telegram': 'راسلني على تيليجرام',
  'Call': 'اتصل بي',
  'Email': 'البريد الإلكتروني',
  'WhatsApp': 'واتساب',
  'Phone': 'الهاتف',
  'Telegram': 'تيليجرام',
  'Facebook': 'فيسبوك',
  'Instagram': 'إنستجرام',
  'LinkedIn': 'لينكدإن',
  'GitHub': 'جيت هاب',
  'Website': 'الموقع الإلكتروني',
  'View certificate': 'عرض الشهادة',
  'Certificate not showing? ': 'الشهادة لا تظهر؟ ',
  'Open it in a new tab': 'افتحها في تبويب جديد',
  'Close': 'إغلاق',
  'years of teaching experience.': 'سنوات من الخبرة في التدريس.',
  'years of professional experience.': 'سنوات من الخبرة المهنية.',
};

// ---------------------------------------------------------------------------
// Directory page
// ---------------------------------------------------------------------------

function tutorCard(t) {
  const tags = (t.tags || []).slice(0, 4);
  // Search haystack carries both languages so typing in either still
  // matches, regardless of which one is currently shown.
  const haystackAr = [t.title, ...tags].filter(Boolean).map((s) => DICT[s]).filter(Boolean).join(' ');

  return `
  <a href="p/${esc(t.profileKey)}/" class="tutor-card${t.featured ? ' featured' : ''}"${themeAttrs(t.theme)}
     data-tutor-card data-name="${esc(t.name)}" data-title="${esc(t.title || '')} ${esc(tags.join(' '))} ${esc(t.location || '')} ${esc(haystackAr)}">
    <div class="card-top">
      ${avatarHtml(t.photo, t.name, 'avatar')}
      <div>
        <h3>${esc(t.name)}</h3>
        ${t.title ? `<p class="title">${bi(t.title)}</p>` : ''}
        ${t.location ? `<p class="title">${esc(t.location)}</p>` : ''}
      </div>
    </div>
    ${t.featured ? `<span class="featured-mark">${bi(t.kind === 'professional' ? 'Featured professional' : 'Featured tutor')}</span>` : ''}
    ${t.summary ? `<p class="summary">${bi(t.summary)}</p>` : ''}
    ${tags.length ? `<div class="tag-row">${tags.map((tag) => `<span class="tag">${bi(tag)}</span>`).join('')}</div>` : ''}
  </a>`;
}

function renderDirectory(directory) {
  const sorted = [...directory.profiles].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
${LANG_PREINIT}
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Profile Directory</title>
<link rel="stylesheet" href="assets/styles.css">
</head>
<body data-theme="emerald">
  <header class="topbar">
    <div class="container">
      <a class="brand" href="./">${bi('Profile Directory')}</a>
      ${langSwitch()}
    </div>
  </header>

  <div class="container">
    <div class="directory-header">
      <h1>${bi('Find a tutor or professional')}</h1>
      <p>${bi('Browse profiles with videos, certificates, experience and contact details.')}</p>
    </div>

    <div class="search-row">
      <input class="search-input" type="text" placeholder="Search by name or title…" data-search-input data-i18n-placeholder-ar="${esc(DICT['Search by name or title…'] || 'ابحث بالاسم أو المسمى الوظيفي…')}" aria-label="Search tutors by name or title">
      <div class="search-count" data-search-count>${sorted.length} <span data-i18n-en>profile${sorted.length === 1 ? '' : 's'}</span><span data-i18n-ar dir="rtl">ملف${sorted.length === 1 ? '' : 'ات'}</span></div>
    </div>

    <div class="tutor-grid">
      ${sorted.map(tutorCard).join('\n')}
    </div>
    <div class="empty-state" data-empty-state style="display:none;">
      ${bi('No profiles match that search.')}
    </div>
  </div>

  <footer class="site-footer">${bi('Generated')} ${esc(directory.generatedAt)}</footer>
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

const CERT_ICONS = {
  file: `<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5.5 2.5h6l3 3v12h-9z"/><path d="M11.5 2.5v3h3"/></svg>`,
  image: `<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="14" height="12" rx="1.5"/><circle cx="7.3" cy="8.3" r="1.2"/><path d="M4 15l4-4 3 3 3-3.5 3 3.5"/></svg>`,
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
    .map(([key, hrefFn, label]) => `<a class="contact-chip" href="${esc(hrefFn(contacts[key]))}" target="_blank" rel="noopener">${CONTACT_ICONS[key]}<span>${bi(label)}</span></a>`);
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
    <h2>${bi('Teaching Profile')}</h2>
    ${groups.map(([label, list]) => `
    <div class="teaching-group">
      <h3 class="group-label">${bi(label)}</h3>
      <div class="pill-list">${list.map((x) => `<span class="pill">${bi(x)}</span>`).join('')}</div>
    </div>`).join('')}
    ${teaching.availability ? `<p style="margin-top:16px;">${bi(teaching.availability)}</p>` : ''}
  </section>`;
}

function experienceSection(teaching) {
  if (!teaching.experienceYears && !teaching.experienceDescription) return '';
  return `
  <section class="profile-section">
    <h2>${bi('Teaching Experience')}</h2>
    ${teaching.experienceYears ? `<p><strong>${esc(teaching.experienceYears)}</strong> ${bi('years of teaching experience.')}</p>` : ''}
    ${teaching.experienceDescription ? `<p>${bi(teaching.experienceDescription)}</p>` : ''}
  </section>`;
}

function philosophySection(teaching) {
  if (!teaching.philosophy) return '';
  return `
  <section class="profile-section">
    <h2>${bi('Teaching Philosophy')}</h2>
    <p class="philosophy-quote">${bi(teaching.philosophy)}</p>
  </section>`;
}

function languagesSection(languages) {
  if (!languages || !languages.length) return '';
  return `
  <section class="profile-section">
    <h2>${bi('Languages')}</h2>
    <ul class="lang-list">
      ${languages.map((l) => `<li><span>${esc(l.language)}</span>${l.proficiency ? `<span class="level">${bi(l.proficiency)}</span>` : ''}</li>`).join('')}
    </ul>
  </section>`;
}

function skillsSection(skills) {
  if (!skills || !skills.length) return '';
  return `
  <section class="profile-section">
    <h2>${bi('Technical Skills')}</h2>
    <div class="pill-list">${skills.map((s) => `<span class="pill">${esc(s)}</span>`).join('')}</div>
  </section>`;
}

function videosSection(videos) {
  if (!videos || !videos.length) return '';
  return `
  <section class="profile-section">
    <h2>${bi('Videos')}</h2>
    <div class="video-grid">
      ${videos.map((v) => `
      <div class="video-item">
        <div class="frame" data-provider="${esc(v.provider || '')}"><iframe src="${esc(v.embedUrl)}" title="${esc(v.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>
        <h3>${bi(v.title)}</h3>
        ${v.description ? `<p>${bi(v.description)}</p>` : ''}
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
        <span class="cert-icon">${kind === 'file' ? CERT_ICONS.file : CERT_ICONS.image}</span>
        <h3>${esc(c.name)}</h3>
        ${c.organization ? `<p class="org">${esc(c.organization)}</p>` : ''}
        ${c.date ? `<p class="date">${esc(c.date)}</p>` : ''}
        ${hasFile ? `<p class="view-hint">${bi('View certificate')}</p>` : ''}
      </button>
    `;
  }).join('');

  return `
  <section class="profile-section">
    <h2>${bi('Certificates')}</h2>
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
    <h2>${bi('Contact')}</h2>
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
function quickFacts(t) {
  const isPro = t.kind === 'professional';
  const expYears = isPro ? (t.professional && t.professional.experienceYears) : (t.teaching && t.teaching.experienceYears);
  const specList = isPro ? (t.professional && t.professional.expertise) : (t.teaching && t.teaching.specializations);

  const facts = [];
  if (expYears) facts.push([expYears, Number(expYears) === 1 ? 'Year experience' : 'Years experience']);
  if (specList && specList.length) facts.push([specList.length, isPro ? 'Areas of expertise' : 'Specializations']);
  if (t.languages && t.languages.length) facts.push([t.languages.length, t.languages.length === 1 ? 'Language' : 'Languages']);
  if (t.certificates && t.certificates.length) facts.push([t.certificates.length, t.certificates.length === 1 ? 'Certificate' : 'Certificates']);

  if (!facts.length) return '';
  return `
      <div class="stat-row">
        ${facts.slice(0, 4).map(([value, label]) => `<div class="stat-card"><div class="stat-value">${esc(value)}</div><div class="stat-label">${bi(label)}</div></div>`).join('')}
      </div>`;
}

// The single most direct way to reach this person, surfaced as one
// prominent button up top — the full list of every contact method they
// gave still lives in the Contact section further down the page.
function primaryCta(contacts) {
  if (!contacts) return '';
  const order = [
    ['whatsapp', (v) => `https://wa.me/${v.replace(/[^\d]/g, '')}`, 'Message on WhatsApp'],
    ['email', (v) => `mailto:${v}`, 'Get in touch'],
    ['telegram', (v) => `https://t.me/${v.replace(/^@/, '')}`, 'Message on Telegram'],
    ['phone', (v) => `tel:${v}`, 'Call'],
  ];
  const hit = order.find(([key]) => contacts[key]);
  if (!hit) return '';
  const [key, hrefFn, label] = hit;
  return `<a class="cta-button" href="${esc(hrefFn(contacts[key]))}" target="_blank" rel="noopener">${CONTACT_ICONS[key] || ''}<span>${bi(label)}</span></a>`;
}

function pillSection(heading, items) {
  if (!items || !items.length) return '';
  return `
  <section class="profile-section">
    <h2>${bi(heading)}</h2>
    <div class="pill-list">${items.map((x) => `<span class="pill">${bi(x)}</span>`).join('')}</div>
  </section>`;
}

function professionalOverviewSection(p) {
  const pro = p.professional || {};
  if (!pro.experienceYears && !pro.experienceSummary) return '';
  return `
  <section class="profile-section">
    <h2>${bi('Professional Overview')}</h2>
    ${pro.experienceYears ? `<p><strong>${esc(pro.experienceYears)}</strong> ${bi('years of professional experience.')}</p>` : ''}
    ${pro.experienceSummary ? `<p>${bi(pro.experienceSummary)}</p>` : ''}
  </section>`;
}

function workExperienceSection(pro) {
  const items = (pro && pro.workExperience) || [];
  if (!items.length) return '';
  return `
  <section class="profile-section">
    <h2>${bi('Work Experience')}</h2>
    ${items.map((w) => `
    <div class="entry">
      ${w.position ? `<h3>${bi(w.position)}</h3>` : ''}
      ${(w.organization || w.period) ? `<p class="entry-meta">${w.organization ? `<span class="entry-org">${esc(w.organization)}</span>` : ''}${w.organization && w.period ? ' · ' : ''}${w.period ? bi(w.period) : ''}</p>` : ''}
      ${w.description ? `<p class="entry-desc">${bi(w.description)}</p>` : ''}
    </div>`).join('')}
  </section>`;
}

function projectsSection(pro) {
  const items = (pro && pro.projects) || [];
  if (!items.length) return '';
  return `
  <section class="profile-section">
    <h2>${bi('Projects & Portfolio')}</h2>
    <div class="project-grid">
      ${items.map((x) => `
      <div class="project-card">
        ${x.name ? `<h3>${bi(x.name)}</h3>` : ''}
        ${x.description ? `<p>${bi(x.description)}</p>` : ''}
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
    <h2>${bi('Education & Qualifications')}</h2>
    ${hasMain ? `
    <div class="edu-block">
      ${edu.qualification ? `<h3>${bi(edu.qualification)}</h3>` : ''}
      ${(edu.institution || edu.graduationYear) ? `<p class="entry-meta">${edu.institution ? `<span class="entry-org">${esc(edu.institution)}</span>` : ''}${edu.institution && edu.graduationYear ? ' · ' : ''}${edu.graduationYear ? esc(edu.graduationYear) : ''}</p>` : ''}
    </div>` : ''}
    ${extra.length ? `<ul class="plain-list">${extra.map((x) => `<li>${bi(x)}</li>`).join('')}</ul>` : ''}
  </section>`;
}

function renderProfile(t) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
${LANG_PREINIT}
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(t.personal.name)}${t.personal.title ? ' — ' + esc(t.personal.title) : ''}</title>
<link rel="stylesheet" href="../../assets/styles.css">
</head>
<body class="profile-body"${themeAttrs(t.personal.theme)}>
  <header class="topbar">
    <div class="container">
      <a class="brand" href="../../">${bi('Profile Directory')}</a>
      ${langSwitch()}
    </div>
  </header>

  <div class="profile-wrap">
    <div class="profile-header">
      <div class="profile-cover">
        ${t.featured ? `<span class="cover-ribbon">★ ${bi(t.kind === 'professional' ? 'Featured professional' : 'Featured tutor')}</span>` : ''}
      </div>
      <div class="photo-frame">
        ${CORNER_ORNAMENT_SVG}
        ${avatarHtml(t.personal.photo, t.personal.name, 'avatar')}
      </div>
      <h1>${esc(t.personal.name)}</h1>
      ${t.personal.title ? `<p class="title">${bi(t.personal.title)}</p>` : ''}
      ${metaLine(t)}
      ${t.personal.summary ? `<p class="summary">${bi(t.personal.summary)}</p>` : ''}
      ${quickFacts(t)}
      ${primaryCta(t.contacts)}
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

  <footer class="site-footer">${esc(t.personal.name)} — ${bi('Profile Directory')}</footer>
  <script src="../../assets/site.js"></script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function loadIndex() {
  if (!fs.existsSync(DATA_INDEX)) return null;
  return JSON.parse(fs.readFileSync(DATA_INDEX, 'utf8'));
}

function loadProfile(profileKey) {
  const file = path.join(DATA_PROFILES_DIR, `${profileKey}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Rebuilds every page. Used by the CLI entry point below, and safe to call
// after any bulk change (a fresh sync.js run, a new scripts/translate.js
// pass, etc).
function buildSite() {
  const directory = loadIndex();
  if (!directory) {
    throw new Error('Missing data/index.json — run scripts/sync.js first.');
  }
  DICT = loadDictionary(UI_AR);

  fs.mkdirSync(PROFILES_OUT_DIR, { recursive: true });
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

  return count;
}

// Rebuilds just one profile page plus the directory page — used by the edit
// backend (server/index.js) after a logged-in user saves a change, so a
// save doesn't have to re-render the whole site. `profile` is the already
// up-to-date profile object (server/index.js writes it to
// data/profiles/<key>.json first, then calls this).
function buildOneProfile(profile) {
  DICT = loadDictionary(UI_AR);
  fs.mkdirSync(PROFILES_OUT_DIR, { recursive: true });
  const outDir = path.join(PROFILES_OUT_DIR, profile.profileKey);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), renderProfile(profile));

  const directory = loadIndex();
  if (directory) {
    fs.writeFileSync(path.join(SITE_DIR, 'index.html'), renderDirectory(directory));
  }
}

module.exports = { buildSite, buildOneProfile, renderProfile, renderDirectory, loadIndex, loadProfile };

if (require.main === module) {
  const count = buildSite();
  console.log(`Built directory page + ${count} profile page(s) into ${SITE_DIR}`);
}
