// Every icon circle shows, in its icon's color (user 2026-10-11: no circle
// options per tile or global). Older tiles keep their stored per-tile disc
// bits (V7-compatible spare bits, HTTP and export keep them), but the device
// and both previews draw every circle the same way: the renderer passes
// Global + glow, the preview marks every tile alike, and the editor has no
// circle fields. The one tint rule and color path stay central.
import assert from 'node:assert/strict';
import {extractDeliveredFunction, readRepoFile} from '../../lib/admin-source.mjs';

const read = file => readRepoFile(file).replace(/\r\n?/g, '\n');
const code = source => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// Persistence stays readable: the packed bits of older tiles load and save.
const header = read('src/tiles/config/tile_config.h');
const config = read('src/tiles/config/tile_config.cpp');
assert.match(header, /uint8_t icon_disc_mode = 0;/);
assert.match(header, /bool icon_glow = true;/);
for (const marker of [
  'static constexpr uint16_t kIconDiscModeShift = 13;',
  'static constexpr uint16_t kSlideshowValueMask = 0x1FFFu;',
  'static constexpr uint16_t kIconGlowOffBit = 0x1u << 15;',
  '(out.image_slideshow_sec & kSlideshowValueMask) | packIconDiscOptions(in));',
  'unpackIconDiscOptions(slideshow, out);',
  'if (tileStoresIconDiscOptions(out.type)) slideshow &= kSlideshowValueMask;',
]) assert.ok(config.includes(marker), `tile_config: ${marker}`);
assert.equal(3600 & 0xE000, 0, 'The largest slideshow value leaves the disc bits free');
const tiles = read('src/web/server/handlers/web_admin_tiles.cpp');
assert.match(tiles, /if \(server\.hasArg\("icon_disc"\)\) \{\s*tile\.icon_disc_mode = normalizeTileIconDiscMode\(server\.arg\("icon_disc"\)\.toInt\(\)\);/);
assert.ok(tiles.includes('if (server.hasArg("icon_glow")) tile.icon_glow = server.arg("icon_glow").toInt() != 0;'));

// Device: every tile draws its circle in Global mode with the icon's color.
const renderer = read('src/tiles/runtime/tile_renderer.cpp');
assert.ok(renderer.includes('tile_icon_disc::apply_tile_options(tile_obj, 0, true);'));
assert.doesNotMatch(renderer, /apply_tile_options\(tile_obj, tile\.icon_disc_mode/);
const surface = read('src/ui/shared/ui_surface_style.cpp');
assert.ok(surface.includes('bool icon_discs_shown() { return true; }'));
assert.ok(surface.includes('uint8_t icon_glow_percent() { return icon_glow::kDefault; }'));
const disc = code(read('src/tiles/runtime/tile_icon_disc.h'));
for (const marker of [
  'inline constexpr char kTags[6] = {};',
  'return r != g || g != b;',
  'const bool tinted = glow_of(disc) && icon_color_tints(rgb);',
  'return tone_color::fill(circle_card(host, card, rgb, tinted, pressed, see_through_card), rgb, tinted,',
  'set_fill_colors(disc, fill.disc_color, pressed.disc_color);',
  'fade_with_card(disc);',
  'ui_surface_style::apply_icon_disc(disc, mode == Mode::Off, mode == Mode::Global, see_through_card);',
  'show_readable(icon, rgb);',
  'inline void set_icon_color(lv_obj_t* icon, lv_color_t color) {',
  'if (lv_obj_t* disc = disc_of(icon)) apply_fill(disc);',
]) assert.ok(disc.includes(marker), `tile_icon_disc: ${marker}`);
// Runtime icon color changes go through set_icon_color; nothing recolors a
// tile icon directly.
assert.ok(code(read('src/tiles/runtime/tile_icon_color_rules.h')).includes('tile_icon_disc::set_icon_color(icon, color);'));
for (const [file, count] of [['src/tiles/runtime/tile_renderer.cpp', 2],
                             ['src/types/switch/renderer.cpp', 1],
                             ['src/types/binary_sensor/renderer.cpp', 1],
                             ['src/types/cover/renderer.cpp', 1]]) {
  const source = code(read(file));
  assert.equal((source.match(/tile_icon_(?:disc::set_icon_color|color_rules::apply)\(/g) || []).length -
    (file.endsWith('tile_renderer.cpp') ? (source.match(/tile_icon_color_rules::apply\(/g) || []).length : 0),
    count, `${file} icon color path`);
  assert.doesNotMatch(source, /lv_obj_set_style_text_color\(\s*(?:widgets?\.)?icon_label/, `${file} must not bypass the disc tint`);
}

// Previews: every tile alike, the same tint rule as the device.
const html = read('src/web/server/render/web_admin_html.cpp');
assert.ok(html.includes('html += "\\" data-icon-disc=\\"0\\" data-icon-glow=\\"1";'), 'Server preview: every circle');
const grid = read('src/web/admin/tiles/grid-preview.js');
assert.ok(grid.includes("el.dataset.iconDisc = '0';") && grid.includes("el.dataset.iconGlow = '1';"));
const live = read('src/web/admin/tiles/live-preview.js');
assert.ok(live.includes("tileElem.dataset.iconDisc = '0';") && live.includes("tileElem.dataset.iconGlow = '1';"));
const iconDiscTinted = new Function(`${extractDeliveredFunction('iconDiscTinted')}; return iconDiscTinted;`)();
const cppRule = rgb => { const r = rgb >> 16 & 255, g = rgb >> 8 & 255, b = rgb & 255; return r !== g || g !== b; };
for (const rgb of [0xFFFFFF, 0xB0B0B0, 0x000000, 0xFFD54F, 0x3B82F6, 0xFF7043, 0xFFFFFE]) {
  const css = `rgb(${rgb >> 16 & 255}, ${rgb >> 8 & 255}, ${rgb & 255})`;
  assert.equal(iconDiscTinted(css), cppRule(rgb), `preview tint rule for ${css}`);
}
const cssColorMatch = extractDeliveredFunction('cssColorMatch');
const cssColorChannels = new Function(`${cssColorMatch}; ${extractDeliveredFunction('cssColorChannels')}; return cssColorChannels;`)();
assert.deepEqual(cssColorChannels('rgb(34, 34, 34)'), [34, 34, 34]);
assert.deepEqual(cssColorChannels('color(srgb 0.133333 0.133333 0.133333 / 0.7)'), [34, 34, 34]);
assert.equal(cssColorChannels('rgba(0, 0, 0, 0)'), null);
const cssColorAlpha = new Function(`${cssColorMatch}; ${extractDeliveredFunction('cssColorAlpha')}; return cssColorAlpha;`)();
assert.equal(cssColorAlpha('color(srgb 0.133333 0.133333 0.133333 / 0.7)'), 0.7);
const css = read('src/web/assets/admin.css');
assert.match(css, /\.tile\.sensor-compact > \.tile-icon\.tile-icon-tinted \{\s*background:var\(--icon-disc-bg, color-mix\(in srgb, currentColor 25%, transparent\)\);/);
assert.doesNotMatch(css, /icon-discs-off|data-icon-disc="2"/, 'No circle-off rules');

// Editor: no circle fields; the icon block only holds Weather's colored
// icons option.
assert.doesNotMatch(html, /_tile_icon_disc" |_tile_icon_glow"|_tile_icon_disc_row|_tile_icon_glow_row|tr\.icon_glow\b|tr\.icon_disc_label/);
const snapshots = read('src/web/admin/tiles/snapshots.js');
assert.match(snapshots, /function syncIconDiscFields\(tab\) \{\s*const weather = [^\n]*=== '12';/);
assert.doesNotMatch(snapshots, /collectIconDiscFields|loadIconDiscFields|resetIconDiscFields|tileTypeHasDiscToggle/);
for (const file of ['type-selection.js', 'drafts.js', 'clipboard.js']) {
  assert.ok(read(`src/web/admin/tiles/${file}`).includes('syncIconDiscFields(prefix);'), `${file} syncs the icon block`);
}
assert.doesNotMatch(read('src/web/admin/tiles/editor.js'), /tileIconDisc|tileIconGlow/);
const i18n = read('src/core/i18n/i18n.cpp');
for (const text of ['"Kreis in Icon-Farbe"', '"Circle in icon color"', '"Icon-Kreis"', '"Icon circle"', '"Kreis-Stärke"', '"Circle strength"']) {
  assert.ok(!i18n.includes(text), `no label ${text}`);
}
console.log('Icon circles: always shown in the icon color on device and previews; old per-tile bits stay readable');
