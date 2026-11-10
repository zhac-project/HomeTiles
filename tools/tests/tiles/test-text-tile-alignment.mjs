// The Text tile's alignment and half height (user 2026-10-12: "rechtsbündig,
// linksbündig, oben, unten, quasi wie bei Word in alle Richtungen" and 0.5
// tiles): the panel (types/text/text_options.h, render_text_tile) and the
// preview (types/text/admin.js, admin.css) read the same value from
// sensor_gauge_max; old tiles (100) stay centered in the middle; the value
// travels through save, drafts, copy/paste and import; a half-height tile
// shows the text alone.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {compileAndRun} from '../../lib/cpp-host.mjs';
import {extractDeliveredFunction, inlineScriptSafe} from '../../lib/admin-source.mjs';
import {runDomHarness} from '../../lib/headless-dom.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');

// Panel: the renderer, the handler and the geometry.
const renderer = read('src/types/text/renderer.cpp');
assert.match(renderer, /const text_tile::Options options = text_tile::unpack\(tile\.sensor_gauge_max\);/);
assert.match(renderer, /options\.h == text_tile::H_LEFT\s+\? LV_TEXT_ALIGN_LEFT/);
assert.match(renderer, /if \(options\.v == text_tile::V_TOP\) \{\s*lv_obj_align\(text_lbl, LV_ALIGN_TOP_MID, 0,\s*header \? tile_icon_disc::row_height\(\) - lv_obj_get_style_pad_top\(card, LV_PART_MAIN\) : 0\);/);
assert.match(renderer, /\} else if \(options\.v == text_tile::V_BOTTOM\) \{\s*lv_obj_align\(text_lbl, LV_ALIGN_BOTTOM_MID, 0, 0\);/);
assert.match(renderer, /lv_obj_align\(text_lbl, LV_ALIGN_CENTER, 0, header \? tile_layout::scale\(12\) : 0\);/,
  'the middle stays where it was');
assert.match(renderer, /if \(!compact && tile\.icon_name\.length\(\) > 0/, 'no icon in a half tile');
assert.match(renderer, /if \(!compact && tile\.title\.length\(\) > 0\)/, 'no title in a half tile');
assert.match(read('src/types/text/web_handler.cpp'),
  /tile\.sensor_gauge_max = server\.hasArg\("text_options"\) \? text_tile::normalize\(server\.arg\("text_options"\)\.toInt\(\)\)\s*: text_tile::kBase;/);
const geometry = read('src/tiles/config/tile_geometry.h');
assert.match(geometry, /inline bool compact_text\(int type, float w, float h\) \{\s*return type == TILE_TEXT && w >= 1 && h == 0\.5f;/);

// Web Admin: the selects, their live binding, drafts and import.
const html = read('src/types/text/web_html.cpp');
for (const key of ['text_align_horizontal', 'text_align_vertical', 'alignment_left', 'alignment_center', 'alignment_right',
  'alignment_top', 'alignment_middle', 'alignment_bottom']) assert.ok(html.includes('tr.' + key), key);
assert.ok(html.includes('_text_align">') && html.includes('_text_valign">'));
const editor = read('src/web/admin/tiles/editor.js');
assert.match(editor, /bindLive\(textAlignInput, 'change', 'textAlign', \(\) => \{ updateTilePreview\(tab\); updateDraft\(tab\); scheduleAutoSave\(tab\); \}\);/);
assert.match(editor, /bindLive\(textValignInput, 'change', 'textValign', \(\) => \{ updateTilePreview\(tab\); updateDraft\(tab\); scheduleAutoSave\(tab\); \}\);/);
assert.match(read('src/web/admin/tiles/snapshots.js'), /Number\(tile\.type\) === 10 && snapshot && Object\.prototype\.hasOwnProperty\.call\(snapshot, 'text_options'\)/);
assert.match(read('src/web/admin/tiles/import-export.js'), /fd\.append\('text_options', \(tile\.sensor_gauge_max !== undefined && tile\.sensor_gauge_max !== null\) \? tile\.sensor_gauge_max : 100\);/);

// Every language has the texts (positional tables: one more string each).
const i18n = read('src/core/i18n/i18n.cpp');
for (const [table, words] of Object.entries({kStringsEn: ['"Horizontal"', '"Vertical"', '"Top"', '"Middle"', '"Bottom"'],
  kStringsDe: ['"Waagerecht"', '"Senkrecht"', '"Oben"', '"Mitte"', '"Unten"'],
  kStringsFr: ['"Horizontal"', '"Vertical"', '"En haut"', '"Milieu"', '"En bas"'],
  kStringsPl: ['"W poziomie"', '"W pionie"', '"Góra"', '"Środek"', '"Dół"']})) {
  const start = i18n.indexOf(`static const Strings ${table} = {`);
  const body = i18n.slice(start, i18n.indexOf('};', start));
  // Near the table's end (the page texts, b413, came after them).
  const tail = body.slice(-1400);
  for (const word of words) assert.ok(tail.includes(word), `${table} ${word}`);
}

// The value: panel and preview alike.
const raws = [100, 0, -1, 100 | (1 << 11), 100 | (2 << 11), 100 | (3 << 11), 100 | (1 << 13), 100 | (2 << 13), 100 | (3 << 13),
  100 | (2 << 11) | (2 << 13), (1 << 11) | (1 << 13), 5000];
const harness = String.raw`
#include <cstdio>
#include <initializer_list>
#include "src/types/text/text_options.h"
int main() {
  for (int raw : {${raws.join(', ')}}) {
    const text_tile::Options o = text_tile::unpack(raw);
    std::printf("%d %d %d %d\n", raw, o.h, o.v, static_cast<int>(text_tile::normalize(raw)));
  }
  return 0;
}
`;
const output = compileAndRun({label: 'Text tile options', harness});
if (output !== null) {
  const panel = Object.fromEntries(output.trim().split('\n').map(l => l.trim().split(' ').map(Number)).map(([raw, ...v]) => [raw, v]));
  assert.deepEqual(panel[100], [0, 0, 100], 'an old tile: centered, middle');
  assert.deepEqual(panel[100 | (2 << 11)], [2, 0, 100 | (2 << 11)], 'right');
  assert.deepEqual(panel[100 | (1 << 13)], [0, 1, 100 | (1 << 13)], 'top');
  assert.deepEqual(panel[100 | (3 << 11)], [0, 0, 100], 'an unknown alignment drops');
  assert.deepEqual(panel[-1], [0, 0, 100]);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(['textTileOptions', 'packTextTileOptions'].map(extractDeliveredFunction).join('\n'), ctx);
  for (const raw of raws) {
    const [h, v, normalized] = panel[raw];
    assert.equal(vm.runInContext(`JSON.stringify(textTileOptions(${raw}))`, ctx), JSON.stringify({h, v}), `options ${raw}`);
    assert.equal(vm.runInContext(`packTextTileOptions(${h}, ${v})`, ctx), normalized, `pack ${raw}`);
  }
}

// The preview on the real admin.css: the lines and the block where the
// panel puts them (in device pixels at half size, inside the 3 px border).
const css = read('src/web/assets/admin.css');
const functions = ['textTileOptions', 'applyTextPreviewAlign'].map(extractDeliveredFunction).join('\n');
const tile = (id, cls, header, options, h = 150) => `<div class="tile text ${cls}" id="${id}" data-options="${options}"
  style="position:absolute;left:10px;top:${10 + 170 * Number(id.slice(1))}px;width:97px;height:${h / 2}px;box-sizing:border-box">
  ${header ? '<div class="tile-title">Title</div>' : ''}<div class="tile-text sensor-value-size-default">Hello</div></div>`;
const page = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
:root{--radius-preview-scale:0.5;--text-header-pad-v:13px;--text-header-pad-h:15px;--text-header-h:67px;--text-compact-pad-v:5px;--fs28:14px;--lh28:17px}
body{margin:0}
</style></head><body>
${tile('t0', '', false, 100 | (1 << 11) | (1 << 13))}
${tile('t1', '', true, 100 | (1 << 13))}
${tile('t2', '', false, 100 | (2 << 11) | (2 << 13))}
${tile('t3', 'text-compact', true, 100 | (2 << 13), 64)}
<pre id="result"></pre><script>
${inlineScriptSafe(functions)}
try {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const near = (a, b, message) => check(Math.abs(a - b) < 0.6, message + ': ' + a + ' vs ' + b);
  const at = id => {
    const tile = document.getElementById(id);
    applyTextPreviewAlign(tile, Number(tile.dataset.options));
    const text = tile.querySelector('.tile-text'), r = text.getBoundingClientRect(), t = tile.getBoundingClientRect();
    return {tile, text, top: r.top - t.top, bottom: t.bottom - r.bottom, align: getComputedStyle(text).textAlign};
  };
  const t0 = at('t0');
  check(t0.align === 'left', 'left: ' + t0.align);
  near(t0.top, 13, 'top: the padding');
  const t1 = at('t1');
  near(t1.top, 67 / 2, 'top below a title: the header row');
  const t2 = at('t2');
  check(t2.align === 'right', 'right');
  near(t2.bottom, 13, 'bottom: the padding');
  const t3 = at('t3');
  check(getComputedStyle(t3.tile.querySelector('.tile-title')).display === 'none', 'a half tile hides its title');
  near(t3.bottom, 5, 'a half tile: the smaller padding');
  document.body.dataset.result = 'pass';
} catch (error) { document.body.dataset.result = 'fail'; document.getElementById('result').textContent = error.message; }
</script></body></html>`;
try { runDomHarness({label: 'Text tile alignment preview', html: page, tmpPrefix: 'hometiles-text-align-'}); }
catch (error) { throw Error(error.message.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || error.message.slice(0, 300)); }
console.log('Text tile: nine alignments and half height, panel and preview alike');
