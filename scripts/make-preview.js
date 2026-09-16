'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT,'site','assets','styles.css'),'utf8');
const js  = fs.readFileSync(path.join(ROOT,'site','assets','site.js'),'utf8');

function inline(htmlPath, cssHref, jsSrc, outName) {
  let html = fs.readFileSync(htmlPath,'utf8');
  html = html.replace(`<link rel="stylesheet" href="${cssHref}">`, `<style>\n${css}\n</style>`);
  html = html.replace(`<script src="${jsSrc}"></script>`, `<script>\n${js}\n</script>`);
  html = html.replace(/href="\.\.\/\.\.\/"/g,'href="#"').replace(/href="p\/[^"]*"/g,'href="#"');
  fs.writeFileSync(path.join(ROOT, outName), html);
  console.log('wrote', outName);
}

inline(path.join(ROOT,'site','index.html'), 'assets/styles.css', 'assets/site.js', 'preview-directory.html');
for (const dir of fs.readdirSync(path.join(ROOT,'site','p'))) {
  inline(path.join(ROOT,'site','p',dir,'index.html'), '../../assets/styles.css', '../../assets/site.js', `preview-${dir}.html`);
}
