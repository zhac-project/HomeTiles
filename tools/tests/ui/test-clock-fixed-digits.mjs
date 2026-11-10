// Fixed-width clock digits (user 2026-10-11: "ständig verschiebt sich was"):
// tabular_digits gives every digit of the clock fonts the widest digit's
// advance and centers the glyph in it, on the real LVGL fonts, so "11:11"
// and "00:00" are equally wide. The clock tile, the screensaver clock and
// the head bar time use it; the Web preview draws the same boxes (.tnum).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {lvglHost} from '../../lib/lvgl-host.mjs';
import {extractDeliveredFunction} from '../../lib/admin-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');

// Panel: the clock lines, their width measure, the head bar time and the
// preview's clock width sample.
const clock = read('src/types/clock/renderer.cpp');
assert.match(clock, /const lv_font_t\* font = tabular_digits::font\(ui_font_for_size\(font_size\)\);/);
assert.match(clock, /lv_text_get_size\(&text_size, text, tabular_digits::font\(ui_font_for_size\(layout_clock_font_size\(size\)\)\)/);
const bar = read('src/ui/tabs/tiles/home_bar.cpp');
assert.match(bar, /return tabular_digits::font\(&ui_font_20\);[\s\S]*?return tabular_digits::font\(&ui_font_32\);/);
assert.match(read('src/web/server/render/web_admin_styles.cpp'), /lv_text_get_size\(&sample, "88:88 PM", tabular_digits::font\(font\)/);
assert.match(read('src/web/server/render/web_admin_html.cpp'), /html \+= "<span class=\\"tnum\\">";/);

// Preview: every place that writes a time uses the digit boxes.
for (const [file, pattern] of [
  ['src/types/clock/admin.js', /setClockDigits\(timeEl, getClockPreviewTime\(timeFormat\)\);/],
  ['src/web/admin/tiles/grid-preview.js', /clockDigitsHtml\(getClockPreviewTime\(clockTimeFormat\)\)/],
  ['src/web/admin/tiles/live-preview.js', /clockDigitsHtml\(getClockPreviewTime\(clockTimeFormat\)\)/],
  ['src/web/admin/navigation/tabs.js', /setClockDigits\(el, getClockPreviewTime\(0\)\);[\s\S]*?setClockDigits\(time, getClockPreviewTime\(screensaverDraft\.time_format\)\)/],
  ['src/web/admin/screensaver/editor.js', /setClockDigits\(time, getClockPreviewTime\(d\.time_format\)\);/],
  ['src/web/admin/settings/display-borders.js', /setClockDigits\(el, text\)/],
]) assert.match(read(file), pattern, file);
assert.match(read('src/web/assets/admin.css'), /\.tnum \{ display:inline-block; width:0\.646em; text-align:center; \}/);
assert.match(read('src/web/assets/admin.css'), /\.tap \{ display:inline-block; width:0\.690em; text-align:center; \}/);
{
  const html = new Function(`const CLOCK_HTML_ESCAPES = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};
    ${extractDeliveredFunction('clockDigitsHtml')}; return clockDigitsHtml;`)();
  // A and P before M in a box as wide as the A: AM and PM match (the panel's
  // tabular_digits); other letters stay plain.
  assert.equal(html('10:52 PM'), '<span class="tnum">1</span><span class="tnum">0</span>:<span class="tnum">5</span><span class="tnum">2</span> <span class="tap">P</span>M');
  assert.equal(html('Pon, April'), 'Pon, April', 'no box without an M');
  assert.equal(html('<1>'), '&lt;<span class="tnum">1</span>&gt;', 'escaped, the entities untouched');
  assert.match(read('src/types/clock/admin.js'), /const CLOCK_HTML_ESCAPES = \{'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'\};/);
}

const host = await lvglHost(root);
if (!host) {
  console.log('SKIP: the fixed digit render test needs LVGL and a host compiler');
  process.exit(0);
}
const out = path.join(root, 'build/tests/clock-fixed-digits');
fs.mkdirSync(out, {recursive: true});
const source = path.join(out, 'test.cpp');
fs.writeFileSync(source, String.raw`
#include <cstdio>
#include <initializer_list>
#include "src/ui/shared/tabular_digits.h"
extern "C" { LV_FONT_DECLARE(ui_font_32); LV_FONT_DECLARE(ui_font_40); LV_FONT_DECLARE(ui_font_96); }

static int width(const lv_font_t* font, const char* text) {
  lv_point_t size{};
  lv_text_get_size(&size, text, font, 0, 0, LV_COORD_MAX, LV_TEXT_FLAG_NONE);
  return size.x;
}

int main() {
  lv_init();
  for (const lv_font_t* base : {&ui_font_32, &ui_font_40, &ui_font_96}) {
    const lv_font_t* fixed = tabular_digits::font(base);
    std::printf("same %d\n", tabular_digits::font(base) == fixed ? 1 : 0);
    int widest = 0;
    for (char c = '0'; c <= '9'; ++c) {
      lv_font_glyph_dsc_t dsc{};
      lv_font_get_glyph_dsc(base, &dsc, c, 0);
      if (dsc.adv_w > widest) widest = dsc.adv_w;
    }
    for (char c = '0'; c <= '9'; ++c) {
      lv_font_glyph_dsc_t own{}, dsc{};
      lv_font_get_glyph_dsc(base, &own, c, 0);
      lv_font_get_glyph_dsc(fixed, &dsc, c, 0);
      // Centered: the ink moves right by half the added space.
      std::printf("digit %c %d %d %d %d\n", c, dsc.adv_w, widest, dsc.ofs_x - own.ofs_x, (widest - own.adv_w) / 2);
    }
    std::printf("width %d %d %d %d %d\n", width(fixed, "11:11"), width(fixed, "00:00"), width(fixed, "18:47"),
                width(base, "11:11"), width(base, "00:00"));
    // AM and PM as wide as each other (the A's advance, the wider one), so
    // the time keeps its width at noon; other letters keep their spacing.
    std::printf("meridiem %d %d %d\n", width(fixed, "08:00 AM"), width(fixed, "08:00 PM"), width(base, " AM") > width(base, " PM") ? 1 : 0);
    std::printf("letters %d %d %d %d\n", width(fixed, "Pon"), width(base, "Pon"), width(fixed, "April"), width(base, "April"));
  }
  return 0;
}
`);
const binary = path.join(out, process.platform === 'win32' ? 'test.exe' : 'test');
let run = spawnSync(host.cxx, [...host.flags, '-std=c++17', '-Wno-deprecated-declarations', source,
  path.join(root, 'src/ui/shared/tabular_digits.cpp'), host.archive, '-o', binary], {encoding: 'utf8'});
assert.equal(run.status, 0, run.stdout + run.stderr);
run = spawnSync(binary, [], {encoding: 'utf8'});
assert.equal(run.status, 0, run.stdout + run.stderr);
let fonts = 0;
for (const line of run.stdout.trim().split('\n')) {
  const [kind, ...v] = line.trim().split(' ');
  if (kind === 'same') { assert.equal(v[0], '1', 'one copy per font'); fonts++; }
  if (kind === 'digit') {
    const [ch, adv, widest, moved, half] = [v[0], ...v.slice(1).map(Number)];
    assert.equal(adv, widest, `digit ${ch} takes the widest advance`);
    assert.equal(moved, half, `digit ${ch} centered`);
  }
  if (kind === 'width') {
    const [ones, zeros, mixed, baseOnes, baseZeros] = v.map(Number);
    assert.equal(ones, zeros, '11:11 as wide as 00:00');
    assert.equal(mixed, zeros, '18:47 as wide as 00:00');
    assert.ok(baseOnes < baseZeros, 'the plain font is proportional (the reason)');
  }
  if (kind === 'meridiem') {
    assert.equal(v[0], v[1], '08:00 AM as wide as 08:00 PM');
    assert.equal(v[2], '1', 'the plain font differs (the reason)');
  }
  if (kind === 'letters') {
    assert.equal(v[0], v[1], 'a P without an M unchanged');
    assert.equal(v[2], v[3], 'an A without an M unchanged');
  }
}
assert.equal(fonts, 3);
console.log('Clock digits: fixed width on the panel fonts and in the preview');
