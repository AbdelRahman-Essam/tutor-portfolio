'use strict';
const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'session';
const TOKEN_TTL = '12h';

function getSecret() {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) {
    // Fails loudly rather than silently signing tokens with a guessable
    // default — a weak/shared secret would let anyone forge a login.
    throw new Error(
      'AUTH_JWT_SECRET is not set. Export a long random value before starting the server, ' +
      'e.g.: export AUTH_JWT_SECRET="$(node -e \'console.log(require("crypto").randomBytes(48).toString("hex"))\')"'
    );
  }
  return secret;
}

function signSession(user) {
  return jwt.sign(
    { username: user.username, profileKey: user.profileKey },
    getSecret(),
    { expiresIn: TOKEN_TTL }
  );
}

function verifySession(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch (e) {
    return null;
  }
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict',
  // Only require HTTPS in production — lets the whole thing be tested over
  // plain http://localhost during development.
  secure: process.env.NODE_ENV === 'production',
  maxAge: 12 * 60 * 60 * 1000,
  path: '/',
};

module.exports = { COOKIE_NAME, COOKIE_OPTIONS, signSession, verifySession };
