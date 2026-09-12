'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'site', 'assets', 'styles.css'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'site', 'assets', 'site.js'), 'utf8');
let html = fs.readFileSync(path.join(ROOT, 'site', 'tutors', 'ahmed-mohamed', 'index.html'), 'utf8');

html = html.replace('<link rel="stylesheet" href="../../assets/styles.css">', `<style>\n${css}\n</style>`);
html = html.replace('<script src="../../assets/site.js"></script>', `<script>\n${js}\n</script>`);
html = html.replace('href="../../"', 'href="#"');

fs.writeFileSync(path.join(ROOT, 'profile-preview-standalone.html'), html);
console.log('Wrote standalone preview.');
