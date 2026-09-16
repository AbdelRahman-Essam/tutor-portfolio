'use strict';
const fs = require('fs');
const path = require('path');
const { parseCSV } = require('./csv');
const { Row } = require('./lib/parse');
const { detectSchema, buildProfile } = require('./lib/schema');

const ROOT = path.join(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'data', 'raw');
const OUT_DIR = path.join(ROOT, 'data', 'profiles');
const OUT_INDEX = path.join(ROOT, 'data', 'index.json');

function publicJSON(profile) {
  const { _admin, ...rest } = profile;
  return rest;
}

function main() {
  if (!fs.existsSync(RAW_DIR)) {
    console.error(`Missing input directory: ${RAW_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(RAW_DIR).filter((f) => /\.csv$/i.test(f)).sort();
  if (!files.length) {
    console.error(`No .csv files found in ${RAW_DIR}`);
    console.error('Export each Google Sheet (File -> Download -> CSV) into that folder.');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (f.endsWith('.json')) fs.unlinkSync(path.join(OUT_DIR, f));
  }

  const ctx = { warnings: [], usedKeys: new Set(), file: '', warnedNoStatus: false };
  const profiles = [];
  const perFile = [];

  for (const file of files) {
    ctx.file = file;
    ctx.warnedNoStatus = false;

    const text = fs.readFileSync(path.join(RAW_DIR, file), 'utf8');
    const rows = parseCSV(text).filter((r) => r.some((c) => c !== ''));
    if (rows.length < 2) {
      ctx.warnings.push(`[${file}] No data rows found, skipped.`);
      continue;
    }

    const headers = rows[0];
    const schema = detectSchema(headers);
    if (!schema) {
      ctx.warnings.push(`[${file}] Could not detect a known form schema from its headers, skipped.`);
      perFile.push({ file, schema: 'UNKNOWN', rows: rows.length - 1, built: 0 });
      continue;
    }

    let built = 0;
    for (const cells of rows.slice(1)) {
      const row = new Row(headers, cells);
      const profile = buildProfile(row, schema, ctx);
      if (profile) { profiles.push(profile); built++; }
    }
    perFile.push({ file, schema: schema.kind, rows: rows.length - 1, built });
  }

  let published = 0;
  const directory = [];

  for (const p of profiles) {
    if (String(p.status).toLowerCase() !== 'approved') continue;
    published++;
    fs.writeFileSync(path.join(OUT_DIR, `${p.profileKey}.json`), JSON.stringify(publicJSON(p), null, 2));

    if (p.visibility === 'public') {
      directory.push({
        profileKey: p.profileKey,
        kind: p.kind,
        featured: !!p.featured,
        name: p.personal.name,
        title: p.personal.title,
        photo: p.personal.photo,
        summary: p.personal.summary,
        theme: p.personal.theme,
        location: p.personal.location,
        tags: p.kind === 'tutor'
          ? [...((p.teaching && p.teaching.specializations) || []).slice(0, 3)]
          : [p.personal.specialization, ...((p.professional && p.professional.expertise) || []).slice(0, 2)].filter(Boolean),
      });
    }
  }

  fs.writeFileSync(OUT_INDEX, JSON.stringify({ generatedAt: new Date().toISOString(), profiles: directory }, null, 2));

  console.log('Source files:');
  perFile.forEach((f) => console.log(`  ${f.file}  schema=${f.schema}  rows=${f.rows}  parsed=${f.built}`));
  console.log(`\nPublished ${published} approved profile(s) -> ${OUT_DIR}`);
  console.log(`Directory (approved + public): ${directory.length} -> ${OUT_INDEX}`);
  if (ctx.warnings.length) {
    console.log(`\n${ctx.warnings.length} warning(s):`);
    ctx.warnings.forEach((w) => console.log('  - ' + w));
  }
}

main();
