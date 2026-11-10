// Web Admin mirror of Settings › Display › Background: the three Web labels in
// every language, the GET/POST endpoint contract, the global settings markup,
// and the browser select/ranges/status against a stubbed endpoint.
import assert from 'node:assert/strict';

import {extractFunction, inlineScriptSafe, readRepoFile} from '../../lib/admin-source.mjs';
import {cppFunctionDefinitions} from '../../lib/cpp-source.mjs';
import {runDomHarness} from '../../lib/headless-dom.mjs';

const read = (file) => readRepoFile(file).replace(/\r\n?/g, '\n');

// --- Strings: positional tables, pinned to their members by name ---
const header = read('src/core/i18n/i18n.h');
const structStart = header.indexOf('struct Strings {');
const members = [...header.slice(structStart, header.indexOf('\n};', structStart))
  .matchAll(/^\s*const char\* (\w+);/gm)].map((match) => match[1]);
const expected = {
  admin_background_photo: ['Hintergrundfoto', 'Background photo', "Photo d'arrière-plan"],
  admin_tile_opacity: ['Kachel-Deckkraft', 'Tile opacity', 'Opacité des tuiles'],
  admin_background_dim: ['Foto abdunkeln', 'Dim photo', 'Assombrir la photo'],
};
const anchor = members.indexOf('background_cant_name');
assert.deepEqual(members.slice(anchor + 1, anchor + 4), Object.keys(expected),
  'the 3 Web labels follow background_cant_name in order');
const i18n = read('src/core/i18n/i18n.cpp');
['kStringsDe', 'kStringsEn', 'kStringsFr'].forEach((name, language) => {
  const start = i18n.indexOf(`static const Strings ${name} = {`);
  assert.ok(start >= 0, `${name} must exist`);
  const literals = [...i18n.slice(start, i18n.indexOf('};', start)).matchAll(/"((?:[^"\\]|\\.)*)"/g)]
    .map((match) => match[1]);
  assert.equal(literals.length, members.length, `${name} has one literal per Strings member`);
  for (const [member, texts] of Object.entries(expected)) {
    assert.equal(literals[members.indexOf(member)], texts[language], `${name}.${member}`);
  }
});

// --- Endpoint: reachable through the cloud's remote Web Admin, no LVGL ---
const routes = read('src/web/server/web_admin.cpp');
for (const [method, handler] of [['HTTP_GET', 'handleGetBackground'], ['HTTP_POST', 'handleSaveBackground']]) {
  const statement = routes.match(
    new RegExp(String.raw`server\.on\("/api/display/background", ${method},[\s\S]*?\}\)\);`))?.[0];
  assert.ok(statement, `${method} /api/display/background route`);
  assert.match(statement, new RegExp(String.raw`withStorageHold\(\[this\]\(\) \{ this->${handler}\(\); \}\)`));
  assert.doesNotMatch(statement, /localOnly/, 'settings only, so remote Web Admin may use it');
}
const handlers = read('src/web/server/handlers/web_admin_background.cpp');
assert.doesNotMatch(handlers, /\blv_/, 'the web thread never touches LVGL');
const save = cppFunctionDefinitions(handlers).find((d) => d.name === 'WebAdminServer::handleSaveBackground');
assert.ok(save, 'handleSaveBackground is missing');
assert.match(save.body, /saveBackground\([\s\S]*background_photo::request_apply\(\)/);
assert.match(save.body, /sendJsonError\(server, 400,/);
const photoError = cppFunctionDefinitions(handlers).find((d) => d.name.endsWith('photo_error'));
assert.ok(photoError, 'photo_error is missing');
assert.match(photoError.body, /Reason::BadName[\s\S]*sdReadyCached\(\)[\s\S]*!exists[\s\S]*Reason::Usable/,
  'a bad name is refused with its reason before the card is checked');
for (const key of ['photo', 'status_text', 'none_label', 'name', 'reason']) {
  assert.match(handlers, new RegExp(String.raw`\\"${key}\\":\\"";\s*appendJsonEscaped\(`), `${key} is JSON-escaped`);
}
for (const status of ['none', 'loading', 'shown', 'no_card', 'not_found', 'unusable', 'no_memory']) {
  assert.ok(handlers.includes(`"${status}"`), `status key ${status}`);
}
assert.match(read('tools/tests/web/test-web-admin-handler-modules.mjs'),
  /'web_admin_background\.cpp': \['GetBackground', 'SaveBackground'\]/);

// --- Markup: once per tab in the global settings grid, server-rendered labels ---
const html = read('src/web/server/render/web_admin_html.cpp');
for (const marker of [
  'appendHtmlEscaped(html, tr.admin_background_photo);',
  'appendHtmlEscaped(html, tr.admin_tile_opacity);',
  'appendHtmlEscaped(html, tr.admin_background_dim);',
  'tab_id + "_global_background_photo"',
  'tab_id + "_global_tile_opacity"',
  'tab_id + "_global_background_dim"',
  'onchange=\\"saveBackgroundSettings({photo: this.value})\\"',
  'oninput=\\"previewBackgroundValue(this)\\" onchange=\\"saveBackgroundSettings({opacity: this.value})\\"',
  'oninput=\\"previewBackgroundValue(this)\\" onchange=\\"saveBackgroundSettings({dim: this.value})\\"',
  'String(Device::kTileOpacityPercentMin)',
  'String(background_rules::kMaxDim)',
]) assert.ok(html.includes(marker), `admin HTML: ${marker}`);
assert.match(read('src/web/admin/core/bootstrap.js'), /loadBackgroundSettings\(\);/);
const borders = read('src/web/admin/settings/display-borders.js');
assert.match(extractFunction('syncGlobalDisplayControls', borders), /renderBackgroundSettings\(tabEl\)/,
  'lazily inserted folder tabs show the last reply');

// --- Browser: select, ranges and status against a stubbed endpoint ---
const page = `<!doctype html><html><body>
<div class="global-settings-field global-background-field"><label>Background photo</label>
<select class="global-background-photo" onchange="saveBackgroundSettings({photo: this.value})"></select>
<span class="global-background-status"></span></div>
<div class="global-radius-field"><input class="global-tile-opacity" type="range" min="0" max="100" step="5" value="60" oninput="previewBackgroundValue(this)" onchange="saveBackgroundSettings({opacity: this.value})"><output class="global-tile-opacity-value">60 %</output></div>
<div class="global-radius-field"><input class="global-background-dim" type="range" min="0" max="60" step="5" value="25" oninput="previewBackgroundValue(this)" onchange="saveBackgroundSettings({dim: this.value})"><output class="global-background-dim-value">25 %</output></div>
<pre id="result">running</pre>
<script>
${inlineScriptSafe(borders)}
const requests = [], timers = new Map(); let timerId = 0, notices = 0;
window.setTimeout = (fn, ms) => { timers.set(++timerId, {fn, ms}); return timerId; };
window.clearTimeout = id => timers.delete(id);
window.fetch = (url, options = {}) => new Promise((resolve, reject) =>
  requests.push({url, method: options.method || 'GET', body: options.body || '', resolve, reject}));
function showNotification() { notices++; }
function t(key) { return key; }
const reply = (index, status, body) =>
  requests[index].resolve({ok: status >= 200 && status < 300, status, json: async () => body});
const state = (photo, status, status_text, extra = {}) => ({success: true, sd_ready: true, photo, status,
  status_text, opacity: 60, dim: 25, opacity_min: 0, none_label: 'None', files: [
    {name: 'a.jpg', usable: true}, {name: 'b.jpg', usable: false, reason: 'Can’t use: progressive JPEG'},
    {name: 'Фото "1".jpg', usable: true}], ...extra});
const check = (ok, message) => { if (!ok) throw Error(message); };
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const texts = select => [...select.options].map(option => option.textContent);
const select = document.querySelector('.global-background-photo');
const opacity = document.querySelector('.global-tile-opacity');
const dim = document.querySelector('.global-background-dim');
const status = document.querySelector('.global-background-status');
(async () => { try {
  loadBackgroundSettings();
  check(requests.length === 1 && requests[0].method === 'GET' && requests[0].url === 'api/display/background', 'GET on load');
  reply(0, 200, state('', 'none', 'Photos from the microSD card, folder /images (JPEG)'));
  await settle();
  check(JSON.stringify(texts(select)) === JSON.stringify(['None', 'a.jpg', 'b.jpg — Can’t use: progressive JPEG', 'Фото "1".jpg']),
    'options: ' + texts(select).join('|'));
  check(select.options[2].disabled && !select.options[1].disabled, 'unusable files cannot be picked');
  check(select.value === '' && opacity.disabled && dim.disabled, 'None greys both ranges');
  check(status.textContent === 'Photos from the microSD card, folder /images (JPEG)', 'status text from the server');

  select.value = 'a.jpg'; select.dispatchEvent(new Event('change'));
  check(requests.length === 2 && requests[1].method === 'POST' && requests[1].url === 'api/display/background' &&
    requests[1].body === 'photo=a.jpg', 'photo POST: ' + requests[1]?.body);
  reply(1, 200, state('a.jpg', 'loading', 'Loading photo…'));
  await settle();
  check(select.value === 'a.jpg' && !opacity.disabled && !dim.disabled && status.textContent === 'Loading photo…', 'reply re-renders');
  check([...timers.values()].some(timer => timer.ms === 2000), 'the final status is fetched again after 2 s');
  loadBackgroundSettings();
  check(timers.size === 0, 'a load replaces the pending reload');
  reply(2, 200, state('a.jpg', 'loading', 'Loading photo…'));
  await settle();
  check([...timers.values()].some(timer => timer.ms === 2000), 'Loading keeps reloading every 2 s');

  opacity.value = '40'; opacity.dispatchEvent(new Event('input'));
  check(requests.length === 3 && document.querySelector('.global-tile-opacity-value').textContent === '40 %', 'input only updates the label');
  opacity.dispatchEvent(new Event('change'));
  check(requests[3].body === 'opacity=40', 'opacity POST: ' + requests[3]?.body);
  check(timers.size === 0, 'a new save replaces the pending reload');
  reply(3, 200, state('a.jpg', 'shown', 'Photos from the microSD card, folder /images (JPEG)', {opacity: 40}));
  await settle();
  const [reloadId, reload] = [...timers.entries()].find(([, timer]) => timer.ms === 2000);
  timers.delete(reloadId); reload.fn();
  check(requests.length === 5 && requests[4].method === 'GET', 'delayed reload');
  reply(4, 200, state('a.jpg', 'shown', 'Photos from the microSD card, folder /images (JPEG)', {opacity: 40}));
  await settle();
  check(opacity.value === '40' && dim.value === '25', 'saved values shown');
  check(timers.size === 0, 'a final status ends the reloads');

  select.value = 'Фото "1".jpg'; select.dispatchEvent(new Event('change'));
  check(requests[5].body === new URLSearchParams({photo: 'Фото "1".jpg'}).toString(), 'names are form-encoded');
  reply(5, 400, {success: false, error: 'Not found'});
  await settle();
  check(status.textContent === 'Not found' && select.value === 'a.jpg' && notices === 0,
    'a refused photo shows the reason and returns to the saved photo');

  loadBackgroundSettings();
  select.value = ''; select.dispatchEvent(new Event('change'));
  reply(7, 200, state('', 'none', 'hint'));
  reply(6, 200, state('a.jpg', 'shown', 'stale'));
  await settle();
  check(select.value === '' && status.textContent === 'hint', 'an older reply never overwrites a newer one');
  select.value = 'a.jpg'; select.dispatchEvent(new Event('change'));
  loadBackgroundSettings();
  reply(9, 200, state('', 'none', 'hint'));
  reply(8, 200, state('a.jpg', 'shown', 'stale'));
  await settle();
  check(select.value === '' && status.textContent === 'hint' && timers.size === 0,
    'an older save reply never overwrites a newer load');

  loadBackgroundSettings();
  reply(10, 200, state('gone.jpg', 'not_found', 'Not found'));
  await settle();
  check(select.value === 'gone.jpg' && texts(select).at(-1) === 'gone.jpg', 'a saved photo the card lacks stays selected');

  const lazy = document.createElement('div');
  lazy.innerHTML = '<select class="global-background-photo"></select><span class="global-background-status"></span>';
  document.body.appendChild(lazy);
  syncGlobalDisplayControls(lazy);
  check(lazy.querySelector('select').value === 'gone.jpg' && lazy.querySelector('span').textContent === 'Not found',
    'a lazily inserted tab shows the last reply');

  dim.value = '30'; dim.dispatchEvent(new Event('change'));
  requests[11].reject(new TypeError('Failed to fetch'));
  await settle();
  check(notices === 1 && dim.value === '25', 'a network failure notifies and restores the saved value');
  document.body.dataset.result = 'pass'; document.getElementById('result').textContent = 'pass';
} catch (error) { document.body.dataset.result = 'fail'; document.getElementById('result').textContent = error.stack; } })();
</script></body></html>`;
runDomHarness({label: 'Background settings select, ranges, status and stale replies', html: page,
  tmpPrefix: 'hometiles-background-'});
