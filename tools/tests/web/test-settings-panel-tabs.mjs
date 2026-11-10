// The settings panel's tabs (user 2026-10-10): "Tile" | "Global" on every
// tile page, "Tile" | "Slideshow" | "Global" on the screensaver page (user
// 2026-10-11); the top bar names the screensaver; selecting a tile
// shows its settings again. The global tile settings live in the panel, and
// the panel may give way so a wide grid never cuts its right edge off.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = file => fs.readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8');

const html = read('src/web/server/render/web_admin_html.cpp');
assert.ok(html.includes('html += R"html(Settings" data-pane="global">'), 'the panel starts on the global pane');
assert.ok(html.includes('onclick=\\"showSettingsPane(\'" + tab_id + "\',\'tile\')\\"') &&
  html.includes('onclick=\\"showSettingsPane(\'" + tab_id + "\',\'global\')\\"'), 'two tab buttons');
assert.ok(html.includes('appendHtmlEscaped(html, screensaver_mode ? tr.admin_slideshow : tr.panel_tab_global);'),
  'the second tab is the slideshow on the screensaver page');
assert.ok(html.includes('data-pane=\\"options\\" onclick=\\"showSettingsPane(\'" + tab_id + "\',\'options\')\\">') &&
  html.includes('html += "<div class=\\"panel-options\\"><section class=\\"global-settings-panel\\"><h3>";'),
  'the screensaver page has its own Global tab');
assert.ok(html.includes('appendHtmlEscaped(html, tr.panel_tab_screensaver);') && !html.includes('<span class="tab-label">Screensaver</span>'),
  'the top bar names the screensaver in the panel language');
assert.ok(html.includes('html += "<div class=\\"panel-global\\">";') && html.includes('html += global_panel;'),
  'the global settings sit in the panel');
assert.ok(!html.includes('folder-footer') && !html.includes('tr.screensaver_hint'),
  'no footer under the grid, the screensaver page neither (user 2026-10-12: its hint stood under an upright preview)');

// Selecting switches the pane; the screensaver's global pane is its background.
const pane = read('src/web/admin/tiles/settings-pane.js');
const calls = [];
const context = {
  document: {getElementById: id => (calls.push(id), id === 'folder1Settings' || id === 'screensaverSettings'
    ? (context[id] ||= {dataset: {}}) : null)},
  isScreensaverTileTab: tab => tab === 'screensaver',
  selectScreensaverBackground: () => calls.push('background'),
};
vm.runInNewContext(pane, context);
context.showSettingsPane('folder1', 'tile');
assert.equal(context.folder1Settings.dataset.pane, 'tile');
context.showSettingsPane('folder1', 'global');
assert.equal(context.folder1Settings.dataset.pane, 'global');
// The head bar's tab (bar layouts, user 2026-10-13).
context.showSettingsPane('folder1', 'head');
assert.equal(context.folder1Settings.dataset.pane, 'head');
context.showSettingsPane('screensaver', 'global');
assert.ok(calls.includes('background'), 'the slideshow tab selects its background');
assert.equal(context.screensaverSettings.dataset.pane, 'global');
context.showSettingsPane('screensaver', 'options');
assert.equal(context.screensaverSettings.dataset.pane, 'options');

assert.ok(read('src/web/admin/tiles/editor.js').match(/setSettingsPane\(tab, 'tile'\);/), 'a selected tile shows its settings');
assert.ok(read('src/web/admin/tiles/editor.js').includes("setSettingsPane('folder0', 'tile');"), 'the parked Settings tile too');
const screensaver = read('src/web/admin/screensaver/editor.js');
assert.ok(screensaver.includes("setSettingsPane('screensaver', 'global');") &&
  screensaver.includes("setSettingsPane('screensaver', 'tile');"), 'background = global, clock = tile');
assert.ok(read('src/web/admin/bundle.json').includes('"src/web/admin/tiles/settings-pane.js"'));

const css = read('src/web/assets/admin.css');
assert.ok(css.includes('flex:0 1 var(--settings-panel-width, 390px);'), 'the panel may shrink');
assert.ok(css.includes('.tile-settings[data-pane="global"] > .tile-specific-settings,') &&
  css.includes('.tile-settings[data-pane="options"] > #screensaverBackgroundSettings,') &&
  css.includes('.tile-settings:not([data-pane="options"]) > .panel-options,') &&
  css.includes('.tile-settings[data-pane="head"] > .tile-specific-settings,') &&
  css.includes('.tile-settings[data-pane="head"] > .panel-global,') &&
  css.includes('.tile-settings:not([data-pane="head"]) > .panel-head { display:none; }'), 'the pane picks what shows');

// Every language names the tabs.
const header = read('src/core/i18n/i18n.h');
const i18n = read('src/core/i18n/i18n.cpp');
const fields = [...header.slice(header.indexOf('struct Strings {')).matchAll(/const char\* (\w+);/g)].map(m => m[1]);
const expected = {
  kStringsDe: ['Kachel', 'Global', 'Bildschirmschoner'],
  kStringsEn: ['Tile', 'Global', 'Screensaver'],
  kStringsFr: ['Tuile', 'Global', 'Écran de veille'],
  kStringsPl: ['Kafelek', 'Globalne', 'Wygaszacz ekranu'],
};
for (const [name, values] of Object.entries(expected)) {
  const start = i18n.indexOf(`static const Strings ${name} = {`);
  const body = i18n.slice(start, i18n.indexOf('\n};', start));
  const table = [...body.matchAll(/^\s*"((?:[^"\\]|\\.)*)",?\s*$/gm)].map(m => m[1]);
  ['panel_tab_tile', 'panel_tab_global', 'panel_tab_screensaver'].forEach((field, i) =>
    assert.equal(table[fields.indexOf(field)], values[i], `${name}.${field}`));
}
console.log('settings panel tabs ok');
