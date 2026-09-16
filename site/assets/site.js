// ---------- Directory search (name/title only, per v1 scope) ----------
(function initSearch() {
  const input = document.querySelector('[data-search-input]');
  if (!input) return;
  const cards = Array.from(document.querySelectorAll('[data-tutor-card]'));
  const countEl = document.querySelector('[data-search-count]');
  const emptyEl = document.querySelector('[data-empty-state]');

  function apply() {
    const q = input.value.trim().toLowerCase();
    let visible = 0;
    cards.forEach((card) => {
      const haystack = (card.dataset.name + ' ' + card.dataset.title).toLowerCase();
      const match = !q || haystack.includes(q);
      card.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    if (countEl) countEl.textContent = `${visible} profile${visible === 1 ? '' : 's'}`;
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

  function openModal(name, embedUrl, kind) {
    if (!backdrop) return;
    modalTitle.textContent = name;
    modalBody.innerHTML = kind === 'image'
      ? `<img src="${embedUrl}" alt="${name}">`
      : `<iframe src="${embedUrl}" title="${name}" allow="autoplay"></iframe>`;
    backdrop.classList.add('open');
  }
  function closeModal() {
    if (!backdrop) return;
    backdrop.classList.remove('open');
    if (modalBody) modalBody.innerHTML = '';
  }
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
})();
