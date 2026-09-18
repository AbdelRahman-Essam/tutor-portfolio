(function () {
  'use strict';

  const form = document.getElementById('profile-form');
  const banner = document.getElementById('banner');
  const saveBtn = document.getElementById('save-btn');
  let currentKind = 'tutor';
  let profileKey = null;

  function showBanner(kind, message) {
    banner.className = `banner ${kind}`;
    banner.textContent = message;
    banner.style.display = '';
  }

  function setByPath(root, dottedPath, value) {
    const parts = dottedPath.split('.');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      node = node[parts[i]] = node[parts[i]] || {};
    }
    node[parts[parts.length - 1]] = value;
  }

  function getByPath(root, dottedPath) {
    return dottedPath.split('.').reduce((node, key) => (node == null ? undefined : node[key]), root);
  }

  // ---- simple scalar + comma-list fields, matched by <input name="a.b"> ----
  const LIST_FIELD_NAMES = new Set([
    'teaching.specializations', 'teaching.ageGroups', 'teaching.levels', 'teaching.format',
    'skills', 'professional.expertise', 'professional.tools', 'education.additional',
  ]);

  function fillSimpleFields(profile) {
    form.querySelectorAll('[name]').forEach((el) => {
      const name = el.getAttribute('name');
      const value = getByPath(profile, name);
      if (value == null) return;
      if (LIST_FIELD_NAMES.has(name)) {
        el.value = Array.isArray(value) ? value.join(', ') : '';
      } else {
        el.value = value;
      }
    });
  }

  function readSimpleFields(payload) {
    form.querySelectorAll('[name]').forEach((el) => {
      const name = el.getAttribute('name');
      if (LIST_FIELD_NAMES.has(name)) {
        const items = el.value.split(',').map((s) => s.trim()).filter(Boolean);
        setByPath(payload, name, items);
      } else {
        setByPath(payload, name, el.value);
      }
    });
  }

  // ---- repeatable-row sections (work experience, projects, languages, videos, certificates) ----
  const REPEATERS = {
    'work-experience-rows': { template: 'tpl-work-experience', fields: ['position', 'organization', 'period', 'description'] },
    'projects-rows': { template: 'tpl-projects', fields: ['name', 'description'] },
    'languages-rows': { template: 'tpl-languages', fields: ['language', 'proficiency'] },
    'videos-rows': { template: 'tpl-videos', fields: ['title', 'type', 'description', 'url'] },
    'certificates-rows': { template: 'tpl-certificates', fields: ['name', 'organization', 'date', 'description', 'url'] },
  };

  function addRow(containerId, values) {
    const config = REPEATERS[containerId];
    const container = document.getElementById(containerId);
    const template = document.getElementById(config.template);
    const node = template.content.firstElementChild.cloneNode(true);
    config.fields.forEach((field) => {
      const input = node.querySelector(`[data-field="${field}"]`);
      if (input && values && values[field] != null) input.value = values[field];
    });
    node.querySelector('.remove-row-btn').addEventListener('click', () => node.remove());
    container.appendChild(node);
  }

  function fillRepeaters(profile) {
    (profile.professional && profile.professional.workExperience || []).forEach((w) => addRow('work-experience-rows', w));
    (profile.professional && profile.professional.projects || []).forEach((p) => addRow('projects-rows', p));
    (profile.languages || []).forEach((l) => addRow('languages-rows', l));
    (profile.videos || []).forEach((v) => addRow('videos-rows', v));
    (profile.certificates || []).forEach((c) => addRow('certificates-rows', c));
  }

  function readRepeater(containerId) {
    const config = REPEATERS[containerId];
    const container = document.getElementById(containerId);
    return Array.from(container.children).map((row) => {
      const item = {};
      config.fields.forEach((field) => {
        const input = row.querySelector(`[data-field="${field}"]`);
        item[field] = input ? input.value.trim() : '';
      });
      return item;
    });
  }

  document.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => addRow(btn.dataset.add, {}));
  });

  function applyKindVisibility(kind) {
    currentKind = kind;
    document.querySelectorAll('[data-kind]').forEach((section) => {
      section.style.display = section.dataset.kind === kind ? '' : 'none';
    });
    document.getElementById('specialization-field').style.display = kind === 'professional' ? '' : 'none';
  }

  // ---- Arabic translations panel ----
  function fillTranslations(translations) {
    const container = document.getElementById('translations-rows');
    const emptyMsg = document.getElementById('translations-empty');
    const template = document.getElementById('tpl-translation');
    container.innerHTML = '';
    emptyMsg.style.display = translations.length ? 'none' : '';
    translations.forEach(({ en, ar }) => {
      const node = template.content.firstElementChild.cloneNode(true);
      node.querySelector('[data-en-text]').textContent = en;
      node.querySelector('.translation-ar').value = ar || '';
      node.querySelector('.translation-ar').dataset.en = en;
      container.appendChild(node);
    });
  }

  async function loadTranslations() {
    const res = await fetch('/api/translations');
    if (!res.ok) return; // non-fatal — the rest of the page still works
    const data = await res.json();
    fillTranslations(data.translations || []);
  }

  document.getElementById('save-translations-btn').addEventListener('click', async () => {
    const btn = document.getElementById('save-translations-btn');
    btn.disabled = true;
    banner.style.display = 'none';
    const translations = Array.from(document.querySelectorAll('#translations-rows .translation-ar')).map((el) => ({
      en: el.dataset.en,
      ar: el.value.trim(),
    }));
    try {
      const res = await fetch('/api/translations', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ translations }),
      });
      const data = await res.json();
      if (!res.ok) {
        showBanner('error', data.error || 'Could not save translations.');
        return;
      }
      showBanner('ok', 'Translations saved.');
      fillTranslations(data.translations);
    } catch (err) {
      showBanner('error', 'Network error — please try again.');
    } finally {
      btn.disabled = false;
    }
  });

  // ---- load ----
  async function load() {
    const meRes = await fetch('/api/me');
    if (!meRes.ok) {
      window.location.href = '/login';
      return;
    }
    const me = await meRes.json();
    profileKey = me.profileKey;
    document.getElementById('whoami').textContent = `Logged in as ${me.username}`;
    const link = document.getElementById('view-live-link');
    link.href = `/p/${profileKey}/`;
    link.style.display = '';

    const profileRes = await fetch('/api/profile');
    if (!profileRes.ok) {
      const data = await profileRes.json().catch(() => ({}));
      showBanner('error', data.error || 'Could not load your profile.');
      return;
    }
    const profile = await profileRes.json();
    applyKindVisibility(profile.kind === 'professional' ? 'professional' : 'tutor');
    fillSimpleFields(profile);
    fillRepeaters(profile);
    await loadTranslations();
  }

  // ---- save ----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveBtn.disabled = true;
    banner.style.display = 'none';

    const payload = {};
    readSimpleFields(payload);
    if (currentKind === 'professional') {
      payload.professional = payload.professional || {};
      payload.professional.workExperience = readRepeater('work-experience-rows');
      payload.professional.projects = readRepeater('projects-rows');
      delete payload.teaching;
      delete payload.skills;
    } else {
      delete payload.professional;
    }
    payload.languages = readRepeater('languages-rows');
    payload.videos = readRepeater('videos-rows');
    payload.certificates = readRepeater('certificates-rows');

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        showBanner('error', data.error || 'Could not save changes.');
        return;
      }
      let msg = 'New data saved. Redirecting to your profile page…';
      if (data.warnings && data.warnings.length) msg += ` (Note: ${data.warnings.join(' ')})`;
      showBanner('ok', msg);
      setTimeout(() => {
        window.location.href = `/p/${profileKey}/`;
      }, 1500);
    } catch (err) {
      showBanner('error', 'Network error — please try again.');
    } finally {
      saveBtn.disabled = false;
    }
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  });

  load();
})();
