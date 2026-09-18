'use strict';
// Accounts are provisioned by an admin (see server/create-user.js), one per
// approved profile — there is no public self-signup. Each account is tied
// to exactly one profileKey; that's the whole authorization model (see
// requireAuth + the profileKey check in server/index.js): a logged-in user
// can edit every section of THEIR OWN profile, and nothing belonging to
// anyone else.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const USERS_FILE = path.join(__dirname, '..', 'users.json');

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    throw new Error(`server/users.json is not valid JSON: ${e.message}`);
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2) + '\n', { mode: 0o600 });
}

function findByUsername(username) {
  const norm = String(username || '').trim().toLowerCase();
  return loadUsers().find((u) => u.username.toLowerCase() === norm) || null;
}

function findByProfileKey(profileKey) {
  return loadUsers().find((u) => u.profileKey === profileKey) || null;
}

// Creates the account if the username is new, or resets its password /
// re-points it at a different profileKey if it already exists. Used by the
// create-user CLI (kept here so both the CLI and any future admin API
// route share one implementation).
function upsertUser({ username, password, profileKey }) {
  const users = loadUsers();
  const norm = String(username).trim().toLowerCase();
  const passwordHash = bcrypt.hashSync(password, 10);
  const idx = users.findIndex((u) => u.username.toLowerCase() === norm);
  const record = { username: String(username).trim(), passwordHash, profileKey, updatedAt: new Date().toISOString() };
  if (idx === -1) {
    record.createdAt = record.updatedAt;
    users.push(record);
  } else {
    users[idx] = { ...users[idx], ...record };
  }
  saveUsers(users);
  return record;
}

function verifyPassword(user, password) {
  return bcrypt.compareSync(password, user.passwordHash);
}

module.exports = { loadUsers, findByUsername, findByProfileKey, upsertUser, verifyPassword };
