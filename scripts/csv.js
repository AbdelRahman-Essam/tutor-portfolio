'use strict';

/**
 * Minimal RFC4180-ish CSV parser/writer — no dependencies.
 * Handles quoted fields, embedded commas, embedded newlines, and "" escaped quotes,
 * which is what Google Sheets produces on "Download as CSV".
 */

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  // Normalize line endings so \r\n inside/outside quotes behaves consistently.
  const s = text.replace(/\r\n/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  // last field/row (files may or may not end with a newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function parseCSVToObjects(text) {
  const rows = parseCSV(text).filter((r) => r.some((cell) => cell !== ''));
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? '').trim();
    });
    return obj;
  });
}

function csvEscape(value) {
  const v = value == null ? '' : String(value);
  if (/[",\n]/.test(v)) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

function stringifyCSV(headers, rowsOfObjects) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const obj of rowsOfObjects) {
    lines.push(headers.map((h) => csvEscape(obj[h])).join(','));
  }
  return lines.join('\n') + '\n';
}

module.exports = { parseCSV, parseCSVToObjects, stringifyCSV };
