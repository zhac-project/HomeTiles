// The Web Admin is one page at "/" and must also work behind the ZHAC Cloud
// remote-editor proxy, which serves it under a path prefix
// (…/plugins/hometiles/open/r/<session>/). Every same-origin URL it uses is
// therefore relative: an absolute "/api/…" would leave the proxy for the
// cloud's own origin. The setup portal (AP mode, src/web/setup) never runs
// behind the proxy and is not checked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8').replaceAll('\r\n', '\n');
const listFiles = (dir, pattern) => fs.readdirSync(path.join(root, dir), {recursive: true})
  .map(entry => path.join(dir, String(entry)).replaceAll('\\', '/'))
  .filter(file => pattern.test(file) && fs.statSync(path.join(root, file)).isFile());

// "/api/…", "/assets/…", "/mqtt", "/restart", "/save", "/bridge…", "/status", "/_…" right after a quote,
// backtick, "(" or "=": a URL the browser would resolve against the origin.
const absoluteUrl = /(?:['"`(=]|url\(\s*['"]?)\/(?:api\/|assets\/|mqtt\b|restart\b|save\b|bridge|status\b|_)/;
// location.href = '/' and friends: a redirect to the origin root.
const rootRedirect = /(?:location(?:\.href)?|href)\s*=\s*['"]\/['"]/;

const bundle = JSON.parse(read('src/web/admin/bundle.json'));
const sources = [
  ...bundle.sources,
  'src/web/assets/admin.css',
  ...listFiles('src/web/server/render', /\.cpp$/),
  ...listFiles('src/types', /\/web_(?:html|scripts|styles)\.cpp$/),
];
assert.ok(bundle.sources.length > 20, 'the admin bundle lists its sources');

const offenders = [];
for (const file of sources) {
  read(file).split('\n').forEach((line, index) => {
    if (absoluteUrl.test(line) || rootRedirect.test(line)) offenders.push(`${file}:${index + 1}: ${line.trim()}`);
  });
}
assert.deepEqual(offenders, [], `absolute same-origin URLs in the Web Admin:\n${offenders.join('\n')}`);

// Redirects after a form POST go back to the page the form came from.
const handlers = listFiles('src/web/server/handlers', /\.cpp$/);
for (const file of handlers) {
  for (const match of read(file).matchAll(/sendHeader\("Location",\s*"([^"]*)"/g)) {
    assert.ok(!match[1].startsWith('/'), `${file}: redirect to "${match[1]}" must be relative`);
  }
}

// Asset links: the generated paths are absolute (they are also the server routes),
// so the page drops the leading "/" when it links them.
const meta = read('src/web/generated/admin_assets_meta.h');
for (const key of ['Css', 'Js']) {
  const assetPath = meta.match(new RegExp(`kAdmin${key}Path\\[\\] =\\s*"([^"]+)"`))?.[1];
  assert.ok(assetPath?.startsWith('/assets/admin.'), `kAdmin${key}Path is a route under /assets/`);
}
assert.match(read('src/web/server/render/web_admin_styles.cpp'), /html \+= adminCssAssetPath\(\) \+ 1;/);
assert.match(read('src/web/server/render/web_admin_scripts.cpp'), /html \+= adminJsAssetPath\(\) \+ 1;/);

// The delivered bundle is the one generated from these sources.
assert.doesNotMatch(read('src/web/assets/admin.js'), /fetch\(['"`]\/api\//, 'admin.js is regenerated');

console.log(`Web Admin URLs are relative (${sources.length} sources checked)`);
