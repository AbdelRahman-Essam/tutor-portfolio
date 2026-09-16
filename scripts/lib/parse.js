'use strict';
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// scalar helpers
// ---------------------------------------------------------------------------

function clean(v) {
  if (v == null) return undefined;
  const s = String(v).replace(/\u00a0/g, ' ').trim();
  return s.length ? s : undefined;
}

function splitList(v) {
  const s = clean(v);
  if (!s) return [];
  return s
    .split(/[,\n]/)
    .map((x) => x.trim().replace(/\.$/, ''))
    .filter(Boolean);
}

function splitLines(v) {
  const s = clean(v);
  if (!s) return [];
  return s.split(/\n+/).map((x) => x.trim()).filter(Boolean);
}

function slugify(input) {
  return String(input)
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function stableId(seedParts) {
  return crypto.createHash('sha1').update(seedParts.filter(Boolean).join('|')).digest('hex').slice(0, 12);
}

// ---------------------------------------------------------------------------
// Row: positional access wrapper.
//
// Google Forms exports repeat header names (e.g. slots 4-7 of the second form
// are all literally "Certificate — Name", and "Do you want to add another
// Video" appears four times). Keying a row object by header name silently
// drops all but the last of those columns, so everything here works off
// header INDEX instead, with name lookup as a convenience for unique headers.
// ---------------------------------------------------------------------------

function normalizeHeader(h) {
  return String(h).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

class Row {
  constructor(headers, cells) {
    this.headers = headers.map(normalizeHeader);
    this.cells = cells;
    this._firstIndex = new Map();
    this.headers.forEach((h, i) => {
      if (!this._firstIndex.has(h)) this._firstIndex.set(h, i);
    });
  }

  at(index) {
    return clean(this.cells[index]);
  }

  // first column with this exact header name
  get(name) {
    const i = this._firstIndex.get(normalizeHeader(name));
    return i === undefined ? undefined : this.at(i);
  }

  has(name) {
    return this._firstIndex.has(normalizeHeader(name));
  }

  // all header indices matching a regex, in sheet order
  indicesMatching(re) {
    const out = [];
    this.headers.forEach((h, i) => { if (re.test(h)) out.push(i); });
    return out;
  }
}

/**
 * Generic repeated-slot extractor.
 *
 * Finds every column whose header matches `anchorRe` (e.g. /Certificate.*Name/)
 * and treats each as the start of one slot. For each slot, the remaining
 * fields are found by scanning forward only as far as the next slot's anchor,
 * so slots stay correctly grouped even when their headers are identical.
 *
 * fieldRes: { fieldName: RegExp }
 */
function extractSlots(row, anchorRe, fieldRes) {
  const anchors = row.indicesMatching(anchorRe);
  const slots = [];

  anchors.forEach((start, n) => {
    const end = n + 1 < anchors.length ? anchors[n + 1] : row.headers.length;
    const slot = { _anchorValue: row.at(start) };
    for (const [field, re] of Object.entries(fieldRes)) {
      for (let i = start; i < end; i++) {
        if (re.test(row.headers[i])) {
          slot[field] = row.at(i);
          break;
        }
      }
    }
    slots.push(slot);
  });

  return slots;
}

// ---------------------------------------------------------------------------
// media
// ---------------------------------------------------------------------------

function extractYouTubeId(url) {
  const m = String(url).match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/
  );
  return m ? m[1] : null;
}

function extractDriveId(url) {
  const s = String(url);
  // folders are a different kind of resource and cannot be embedded as media
  const folder = s.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  if (folder) return { id: folder[1], isFolder: true };
  const m = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return m ? { id: m[1], isFolder: false } : null;
}

/**
 * Normalizes YouTube or Google Drive URLs into one embeddable shape.
 * kind: 'video' | 'image' | 'file'
 * Returns undefined (plus a reason via onWarn) if it can't be embedded.
 */
function normalizeMedia(url, kind, onWarn, label) {
  const u = clean(url);
  if (!u) return undefined;

  const ytId = extractYouTubeId(u);
  if (ytId) {
    return { provider: 'youtube', id: ytId, embedUrl: `https://www.youtube.com/embed/${ytId}` };
  }

  const drive = extractDriveId(u);
  if (drive) {
    if (drive.isFolder) {
      if (onWarn) onWarn(`${label}: link is a Google Drive FOLDER, which cannot be embedded as media. Link a single file instead: ${u}`);
      return undefined;
    }
    if (kind === 'image') {
      // thumbnail endpoint hotlinks far more reliably than uc?export=view
      return { provider: 'drive', id: drive.id, embedUrl: `https://drive.google.com/thumbnail?id=${drive.id}&sz=w1000` };
    }
    return { provider: 'drive', id: drive.id, embedUrl: `https://drive.google.com/file/d/${drive.id}/preview` };
  }

  if (onWarn) onWarn(`${label}: URL not recognized as YouTube or Google Drive, skipped: ${u}`);
  return undefined;
}

// ---------------------------------------------------------------------------
// structured free-text blocks
//
// The professional form collects Work Experience and Projects as one big
// textarea using a repeated labelled format:
//
//   Experience 1
//   Position:
//   Embedded Software Engineer
//   Organization:
//   Swift Act
//   ...
//
// These parse it back into structured entries. Anything that doesn't match
// the expected shape is preserved as a free-text description rather than lost.
// ---------------------------------------------------------------------------

function parseLabeledBlocks(text, blockRe, fieldNames) {
  const s = clean(text);
  if (!s) return [];

  const norm = s.replace(/\r/g, '');
  const parts = norm.split(blockRe).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return [];

  const labelAlt = fieldNames.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const labelRe = new RegExp(`^\\s*(${labelAlt})\\s*:\\s*$`, 'i');

  return parts.map((part) => {
    const lines = part.split('\n').map((l) => l.trim());
    const entry = {};
    let current = null;
    let buffer = [];

    const flush = () => {
      if (current) {
        const val = buffer.join('\n').trim();
        if (val) entry[current.toLowerCase()] = val;
      }
      buffer = [];
    };

    for (const line of lines) {
      const m = line.match(labelRe);
      // also tolerate "Position: value" on one line
      const inline = !m && line.match(new RegExp(`^\\s*(${labelAlt})\\s*:\\s*(.+)$`, 'i'));
      if (m) {
        flush();
        current = m[1];
      } else if (inline) {
        flush();
        current = inline[1];
        buffer.push(inline[2]);
      } else if (line) {
        buffer.push(line);
      } else if (buffer.length) {
        buffer.push('');
      }
    }
    flush();

    // If nothing matched the labelled shape, keep the raw text so no data is lost.
    if (Object.keys(entry).length === 0) {
      const raw = part.trim();
      if (raw) entry.description = raw;
    }
    return entry;
  }).filter((e) => Object.keys(e).length > 0);
}

function parseWorkExperience(text) {
  return parseLabeledBlocks(text, /^\s*Experience\s+\d+\s*$/gim, ['Position', 'Organization', 'Period', 'Description'])
    .map((e) => ({
      position: e.position,
      organization: e.organization,
      period: e.period,
      description: e.description,
    }))
    .filter((e) => e.position || e.organization || e.description);
}

function parseProjects(text) {
  return parseLabeledBlocks(text, /^\s*Project\s+\d+\s*$/gim, ['Name', 'Description', 'Role', 'Link'])
    .map((e) => ({
      name: e.name,
      description: e.description,
      role: e.role,
      link: e.link,
    }))
    .filter((e) => e.name || e.description);
}

/**
 * Languages come in two shapes across the forms:
 *   - tutor form: separate "English Proficiency" column + freeform "Other Language Proficiency"
 *   - professional form: one "Languages" cell, newline separated, "Arabic — Native"
 */
function parseLanguageLines(text) {
  const out = [];
  for (const line of splitLines(text)) {
    const parts = line.split(/—|–|-|:/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      out.push({ language: parts[0], proficiency: parts.slice(1).join(' ') });
    } else if (parts.length === 1) {
      out.push({ language: parts[0] });
    }
  }
  return out;
}

module.exports = {
  clean, splitList, splitLines, slugify, stableId,
  Row, normalizeHeader, extractSlots,
  normalizeMedia, extractYouTubeId, extractDriveId,
  parseWorkExperience, parseProjects, parseLanguageLines,
};
