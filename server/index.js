'use strict';
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { COOKIE_NAME, COOKIE_OPTIONS, signSession, verifySession } = require('./lib/auth');
const { findByUsername, verifyPassword } = require('./lib/users');
const { loadProfile } = require('../scripts/build-site');
const { updateProfile, getTranslations, saveTranslations } = require('./lib/profile-store');

const ROOT = path.join(__dirname, '..');
const SITE_DIR = path.join(ROOT, 'site');
const PORT = process.env.PORT || 3000;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ---------------------------------------------------------------------------
// A basic same-site guard for state-changing requests. The session cookie
// is httpOnly + SameSite=Strict already (see lib/auth.js), which is most of
// the CSRF protection a small same-origin app like this needs; checking
// Origin (sent by every browser on fetch/XHR requests) on top of that stops
// a form POST/simple-request forgery from a third-party page too.
function sameOriginGuard(req, res, next) {
  const origin = req.get('origin');
  if (!origin) return next(); // same-origin navigations/fetches from older browsers may omit it
  const host = req.get('host');
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid Origin header.' });
  }
  if (originHost !== host) {
    return res.status(403).json({ error: 'Cross-origin request blocked.' });
  }
  next();
}

function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  const session = token && verifySession(token);
  if (!session) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  req.session = session; // { username, profileKey }
  next();
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

app.post('/api/login', sameOriginGuard, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  const user = findByUsername(username);
  if (!user || !verifyPassword(user, password)) {
    // Same message either way — don't reveal whether the username exists.
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
  const token = signSession(user);
  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
  res.json({ ok: true, profileKey: user.profileKey, username: user.username });
});

app.post('/api/logout', sameOriginGuard, (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTIONS, maxAge: undefined });
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ username: req.session.username, profileKey: req.session.profileKey });
});

// ---------------------------------------------------------------------------
// Profile read/edit — always scoped to the caller's OWN profileKey from
// their session, never a profileKey supplied by the client. That's the
// entire authorization boundary: no route here ever takes a profile
// identifier as input, so there's no parameter to tamper with to reach
// someone else's page.
// ---------------------------------------------------------------------------

app.get('/api/profile', requireAuth, (req, res) => {
  const profile = loadProfile(req.session.profileKey);
  if (!profile) {
    return res.status(404).json({ error: 'Your profile record could not be found. Contact an admin.' });
  }
  res.json(profile);
});

app.put('/api/profile', requireAuth, sameOriginGuard, (req, res) => {
  try {
    const { profile, warnings } = updateProfile(req.session.profileKey, req.body || {});
    res.json({ ok: true, profile, warnings });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not save profile.' });
  }
});

// The Arabic translation of this profile's own text — separate from
// /api/profile because it edits data/i18n/<profileKey>.json (consumed by
// build-site.js's bi(), see SYSTEM_OVERVIEW.md §6a), not
// data/profiles/<profileKey>.json.
app.get('/api/translations', requireAuth, (req, res) => {
  try {
    res.json({ translations: getTranslations(req.session.profileKey) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not load translations.' });
  }
});

app.put('/api/translations', requireAuth, sameOriginGuard, (req, res) => {
  try {
    const translations = normalizeTranslationsBody(req.body);
    res.json({ ok: true, translations: saveTranslations(req.session.profileKey, translations) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Could not save translations.' });
  }
});

// Accepts either {"English": "Arabic", ...} directly, or the
// {translations: [{en, ar}, ...]} shape /api/translations GET returns (so
// the edit page can just round-trip what it fetched).
function normalizeTranslationsBody(body) {
  if (Array.isArray(body && body.translations)) {
    const map = {};
    for (const { en, ar } of body.translations) map[en] = ar;
    return map;
  }
  return body || {};
}

// ---------------------------------------------------------------------------
// Static files: the login/edit pages, and the generated public site itself
// (so the whole thing can run behind one process — see deploy/README.md
// for running the public site through nginx instead, with only /api and
// /login /edit proxied to this server).
// ---------------------------------------------------------------------------

app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/edit', (req, res) => res.sendFile(path.join(__dirname, 'public', 'edit.html')));
app.use('/edit', express.static(path.join(__dirname, 'public')));
app.use(express.static(SITE_DIR));

app.listen(PORT, () => {
  console.log(`Profile portfolio server listening on http://localhost:${PORT}`);
  console.log(`  Public site: http://localhost:${PORT}/`);
  console.log(`  Login:       http://localhost:${PORT}/login`);
  console.log(`  Edit:        http://localhost:${PORT}/edit`);
});
