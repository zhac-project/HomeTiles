// Tile Settings: "Color" above the icon color, the tile color and Fill, then
// "Advanced" above the type's options, instead of the separate "Icon" and
// "Tile" sections (user 2026-10-11: "Farbe, und dann für die anderen
// Erweitert"). "Advanced" hides when the type shows no options. The Rules
// keep their own caption.
import assert from 'node:assert/strict';
import {extractDeliveredFunction, readRepoFile} from '../../lib/admin-source.mjs';
import {runDomHarness} from '../../lib/headless-dom.mjs';

const html = readRepoFile('src/web/server/render/web_admin_html.cpp').replace(/\r\n/g, '\n');
const body = html.slice(html.indexOf('<div class="tile-settings-body">'), html.indexOf('append_tile_type_fields_html(html, type_ctx);'));
assert.equal((body.match(/<div class=\\?"tile-settings-group\\?"/g) || []).length, 2, 'two captions: Color and Advanced');
const at = text => body.indexOf(text);
assert.ok(at('tr.tile_group_color') < at('append_tile_icon_color_fixed_html(html, tab_id);') &&
  at('append_tile_icon_color_fixed_html(html, tab_id);') < at('_tile_color_modes') &&
  at('_tile_color_modes') < at('append_tile_color_from_icon_html(html, tab_id);') &&
  at('append_tile_color_from_icon_html(html, tab_id);') < at('tr.tile_group_advanced') &&
  at('tr.tile_group_advanced') < at('_tile_size_note'), 'Color: icon color, tile color, Fill; then Advanced');
assert.ok(body.includes('"_tile_group_advanced\\">";'));
const selection = readRepoFile('src/web/admin/tiles/type-selection.js');
assert.ok(selection.includes('syncTileAdvancedCaption(tab);') && selection.includes("caption.classList.toggle('hidden', !any);"),
  'Advanced hides without options');
assert.ok(!/tile_group_tile/.test(html + readRepoFile('src/core/i18n/i18n.h')), 'no Tile caption left');
// The icon picker beside the title keeps its "Icon" label.
assert.ok(html.includes('appendHtmlEscaped(html, tr.tile_group_icon);'));
const i18n = readRepoFile('src/core/i18n/i18n.cpp');
for (const text of ['"Erweitert"', '"Advanced"', '"Avancé"', '"Zaawansowane"', '"Farbe"', '"Couleur"', '"Kolor"']) {
  assert.ok(i18n.includes(text), text);
}
// The delivered caption sync on a real DOM: no visible option hides it, a
// visible one or the half-size note shows it.
const page = `<!doctype html><html><body>
<div id="tSettings"><div class="tile-settings-group" id="t_tile_group_advanced">Advanced</div>
<p hidden id="t_tile_size_note">note</p>
<div class="type-fields show" id="t_scene_fields"><input type="hidden" id="h"><input type="checkbox" hidden id="c">
<div class="hidden"><select id="s"></select></div></div></div>
<pre id="result"></pre><script>
${extractDeliveredFunction('syncTileAdvancedCaption')}
try {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const caption = document.getElementById('t_tile_group_advanced');
  syncTileAdvancedCaption('t');
  check(caption.classList.contains('hidden'), 'no visible option: hidden');
  document.querySelector('.type-fields .hidden').classList.remove('hidden');
  syncTileAdvancedCaption('t');
  check(!caption.classList.contains('hidden'), 'a visible option: shown');
  document.getElementById('s').parentElement.classList.add('hidden');
  document.getElementById('t_tile_size_note').hidden = false;
  syncTileAdvancedCaption('t');
  check(!caption.classList.contains('hidden'), 'the half-size note: shown');
  document.body.dataset.result = 'pass';
} catch (error) { document.body.dataset.result = 'fail'; document.getElementById('result').textContent = error.message; }
</script></body></html>`;
try { runDomHarness({label: 'Advanced caption', html: page, tmpPrefix: 'hometiles-advanced-caption-'}); }
catch (error) { throw Error(error.message.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || error.message.slice(0, 300)); }
console.log('Tile Settings: Color above the colors, Advanced above the options');
