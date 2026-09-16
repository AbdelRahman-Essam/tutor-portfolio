'use strict';

// ---------------------------------------------------------------------------
// Theme color resolution
//
// The sheet's "Preferred Profile Theme" column is free text — most people
// pick one of the suggested names (Emerald, Deep Blue, ...), but nothing
// stops someone typing "Rose Gold" or "Ocean" or anything else. Previously,
// only the 7 hardcoded CSS themes in styles.css actually changed color;
// any other word silently fell back to the default emerald accent, so two
// profiles with completely different requested themes could render
// identically.
//
// This module makes EVERY word produce its own color:
//   - The original curated names keep their exact hand-picked hex values
//     (unchanged look for existing profiles).
//   - Any other word is hashed into a hue deterministically, so the same
//     word always renders the same color, different words reliably render
//     as different colors, and it stays in the same muted, ink-forward
//     saturation/lightness range as the hand-picked palette (no jarring
//     neon accents).
//   - "dark" is kept as a whole-palette flip (paper/ink invert, not just
//     the accent), handled by the existing [data-theme="dark"] CSS block,
//     so it's excluded from per-word color generation.
// ---------------------------------------------------------------------------

const { slugify } = require('./parse');

const CURATED = {
  'emerald': { accent: '#0E6B4F', tint: '#E4F0EA' },
  'deep-blue': { accent: '#1E3A5F', tint: '#E4EAF1' },
  'deepblue': { accent: '#1E3A5F', tint: '#E4EAF1' },
  'teal': { accent: '#0B6E77', tint: '#DFF0F1' },
  'burgundy': { accent: '#7A2333', tint: '#F4E4E7' },
  'sand': { accent: '#A9772F', tint: '#F5ECDD' },
  'purple': { accent: '#5B3170', tint: '#EFE4F2' },
};

// Deterministic string hash (DJB2). No external dependency, stable across
// runs/machines/Node versions — same input string always yields the same
// number.
function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(h >>> 0);
}

// Turn an arbitrary word into an accent + tint pair. Saturation/lightness
// are fixed (only the hue varies) and matched to the same range as the
// curated jewel tones above (~25-32% lightness, ~40-80% saturation) so a
// generated theme reads as another deliberate color choice, not a paler
// placeholder next to the hand-picked ones.
function colorFromWord(word) {
  const hue = hashString(word) % 360;
  const accent = `hsl(${hue}, 55%, 27%)`;
  const tint = `hsl(${hue}, 38%, 92%)`;
  return { accent, tint };
}

// Resolve a raw (or already-slugified) theme word into:
//   { slug, accent, tint }
// accent/tint are null for 'dark', since that theme is applied purely via
// the [data-theme="dark"] CSS block (it changes more than the accent).
function resolveTheme(rawWord) {
  const slug = slugify(rawWord || '') || 'emerald';

  if (slug === 'dark') {
    return { slug, accent: null, tint: null };
  }

  const curated = CURATED[slug];
  if (curated) {
    return { slug, accent: curated.accent, tint: curated.tint };
  }

  return { slug, ...colorFromWord(slug) };
}

module.exports = { resolveTheme, CURATED };
