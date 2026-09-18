'use strict';
// Admin-only CLI: creates (or updates the password/binding of) the login
// for one approved profile. There is no self-signup — accounts are always
// provisioned this way, tying one username to exactly one profileKey.
//
// Usage:
//   node server/create-user.js <profileKey> <username> <password>
//
// Example:
//   node server/create-user.js ahmed-mohamed ahmed 'a-strong-password-123'

const path = require('path');
const { loadProfile } = require('../scripts/build-site');
const { upsertUser, findByUsername } = require('./lib/users');

function main() {
  const [profileKey, username, password] = process.argv.slice(2);
  if (!profileKey || !username || !password) {
    console.error('Usage: node server/create-user.js <profileKey> <username> <password>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const profile = loadProfile(profileKey);
  if (!profile) {
    console.error(`No profile found at data/profiles/${profileKey}.json — check the key (it's the URL slug, e.g. "ahmed-mohamed").`);
    process.exit(1);
  }

  const clash = findByUsername(username);
  if (clash && clash.profileKey !== profileKey) {
    console.error(`Username "${username}" is already taken by a different profile (${clash.profileKey}). Choose another.`);
    process.exit(1);
  }

  upsertUser({ username, password, profileKey });
  console.log(`OK: "${username}" can now log in and edit the "${profileKey}" profile (${profile.personal.name}).`);
}

main();
