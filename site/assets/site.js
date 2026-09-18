// ---------- Directory search (name/title only, per v1 scope) ----------
(function initSearch() {
  const input = document.querySelector('[data-search-input]');
  if (!input) return;
  const cards = Array.from(document.querySelectorAll('[data-tutor-card]'));
  const countEl = document.querySelector('[data-search-count]');
  const emptyEl = document.querySelector('[data-empty-state]');

  function formatCount(n) {
    if (!countEl) return '';
    if (n === 1 && countEl.dataset.countOne) return countEl.dataset.countOne;
    return (countEl.dataset.countOther || '{n}').replace('{n}', n);
  }

  function apply() {
    const q = input.value.trim().toLowerCase();
    let visible = 0;
    cards.forEach((card) => {
      const haystack = (card.dataset.name + ' ' + card.dataset.title).toLowerCase();
      const match = !q || haystack.includes(q);
      card.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    if (countEl) countEl.textContent = formatCount(visible);
    if (emptyEl) emptyEl.style.display = visible === 0 ? '' : 'none';
  }

  input.addEventListener('input', apply);
  apply();
})();

// ---------- Certificate display: lightbox/modal ----------
(function initCertificates() {
  const root = document.querySelector('[data-cert-section]');
  if (!root) return;

  root.querySelectorAll('[data-cert-card]').forEach((card) => {
    card.addEventListener('click', () => {
      openModal(card.dataset.name, card.dataset.embedUrl, card.dataset.embedKind);
    });
  });

  const backdrop = document.querySelector('[data-cert-modal-backdrop]');
  const modalTitle = document.querySelector('[data-cert-modal-title]');
  const modalBody = document.querySelector('[data-cert-modal-body]');
  const closeBtn = document.querySelector('[data-cert-modal-close]');
  // Localized "Certificate not showing? / Open it in a new tab" text is
  // baked into the page (see certificatesSection() in build-site.js) rather
  // than hardcoded here, since this same site.js file is shared by both the
  // English and Arabic builds.
  const fallbackTpl = document.querySelector('.cert-modal-fallback-tpl');
  const fallbackPrefix = fallbackTpl ? fallbackTpl.dataset.fallbackPrefix : 'Certificate not showing?';
  const fallbackLinkText = fallbackTpl ? fallbackTpl.dataset.fallbackLink : 'Open it in a new tab';

  // Same fix as the Drive video embeds: keep the iframe fixed at a normal
  // desktop size, then scale it down to fit the wrapper — on both axes this
  // time, since certificate documents can be portrait, landscape, or a
  // multi-page PDF, unlike the fixed 16:9 of a video.
  const DRIVE_W = 640;
  const DRIVE_H = 820;
  function fitDriveFrame() {
    const wrap = modalBody.querySelector('.cert-frame-wrap');
    const frame = wrap && wrap.querySelector('iframe');
    if (!wrap || !frame) return;
    const scale = Math.min(wrap.clientWidth / DRIVE_W, wrap.clientHeight / DRIVE_H);
    frame.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }

  function openModal(name, embedUrl, kind) {
    if (!backdrop) return;
    modalTitle.textContent = name;
    modalBody.innerHTML = (kind === 'image'
      ? `<img src="${embedUrl}" alt="${name}">`
      : `<div class="cert-frame-wrap"><iframe src="${embedUrl}" title="${name}" allow="autoplay"></iframe></div>`)
      + `<p class="cert-modal-fallback">${fallbackPrefix} <a href="${embedUrl}" target="_blank" rel="noopener">${fallbackLinkText}</a>.</p>`;
    backdrop.classList.add('open');
    if (kind !== 'image') requestAnimationFrame(fitDriveFrame);
  }
  function closeModal() {
    if (!backdrop) return;
    backdrop.classList.remove('open');
    if (modalBody) modalBody.innerHTML = '';
  }
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  window.addEventListener('resize', fitDriveFrame);
  window.addEventListener('orientationchange', fitDriveFrame);
})();

// ---------- Google Drive video embeds: fit to container width ----------
// Drive's /preview page renders its own mobile layout once its iframe gets
// narrow, shrinking the video into the middle of the frame instead of
// filling it ("zoomed out"). Keeping the iframe itself fixed at a normal
// desktop size (set in styles.css) and scaling the whole thing down with a
// CSS transform — instead of resizing the iframe — keeps Drive on its
// normal, filled-frame layout at every screen size.
(function fitDriveVideos() {
  const DRIVE_WIDTH = 640; // matches the fixed iframe width in styles.css
  const frames = Array.from(document.querySelectorAll('.frame[data-provider="drive"]'));
  if (!frames.length) return;

  function fit() {
    frames.forEach((frame) => {
      const iframe = frame.querySelector('iframe');
      if (!iframe) return;
      const scale = frame.clientWidth / DRIVE_WIDTH;
      iframe.style.transform = `scale(${scale})`;
    });
  }

  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', fit);
})();
