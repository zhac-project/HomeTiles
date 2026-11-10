// Global display settings (user 2026-10-11): only Tile borders, the layout
// and the theme stay global. The tile color, the icon circles, their strength
// and the radius are fixed per theme; a tile with an icon takes its color
// from the icon ("Fill"), only Clock, Text and Pixel animation keep an own
// color. Device and both previews use the same fixed values.
import assert from 'node:assert/strict';
import {extractFunction, readRepoFile} from '../../lib/admin-source.mjs';

const read = file => readRepoFile(file).replace(/\r\n?/g, '\n');

// Fixed values: the dark card, the circle strength, the radius.
const tileColor = read('src/core/config/tile_color.h');
assert.match(tileColor, /constexpr uint32_t kDefault = 0x1A1A1A;/, 'The dark card is the HomeTiles dark grey');
assert.match(tileColor, /constexpr uint32_t kPreviousDefault = 0x222222;/);
assert.match(tileColor, /constexpr uint32_t kLegacyDefault = 0x2A2A2A;/);
assert.match(tileColor, /return normalize\(rgb\) == kDefault \|\| normalize\(rgb\) == kLegacyDefault \|\|\s*normalize\(rgb\) == kPreviousDefault;/);
assert.match(read('src/ui/shared/ui_theme.h'), /kDark = \{0x000000, 0x1A1A1A,/, 'tile_color::kDefault is the dark theme card');
const tileConfig = read('src/tiles/config/tile_config.cpp');
assert.match(tileConfig, /uint32_t tileDefaultBgColor\(\) \{[\s\S]*?return ui_theme::card\(\);\s*\}/, 'The card of the theme, no setting');
const glow = read('src/core/config/icon_glow.h');
assert.ok(glow.includes('inline constexpr uint8_t kDefault = 25;'));
const surface = read('src/ui/shared/ui_surface_style.cpp');
assert.ok(surface.includes('uint8_t icon_glow_percent() { return icon_glow::kDefault; }'));
assert.ok(surface.includes('bool icon_discs_shown() { return true; }'));
assert.ok(surface.includes('return tone_color::disc_opa(icon_glow_percent(), key >= kIconDiscModes);'));
assert.doesNotMatch(surface, /getConfig\(\)\.(icon_discs|icon_glow|tile_radius|default_tile_color)/);
// The percent sets the circle step; circles are opaque, only see-through
// screensaver tiles keep the percent as a veil opacity (tone_color.h).
const tone = read('src/ui/shared/tone_color.h');
assert.ok(tone.includes('if (!see_through) return percent ? 255 : 0;'));
assert.ok(tone.includes('return static_cast<uint8_t>((percent * 255 + 50) / 100);'));

// Only Clock, Text and Pixel animation keep an own color; every other type
// is drawn on the theme's card (and filled from its icon at runtime).
const tileHeader = read('src/tiles/config/tile_config.h');
assert.ok(tileHeader.includes('return type == TILE_CLOCK || type == TILE_TEXT || type == TILE_PIXELANIM;'));
assert.ok(tileHeader.includes('if (!tileBgColorIsSet(tile) || !tileTypeKeepsOwnColor(tile.type)) return default_color & TILE_BG_COLOR_RGB_MASK;'));
assert.match(tileHeader, /return stored == 0 \|\| tile_color::isDefaultGrey\(stored\);/);
const tileType = read('src/types/tile_type.h');
assert.ok(tileType.includes('TILE_CLOCK = 9,') && tileType.includes('TILE_TEXT = 10,') && tileType.includes('TILE_PIXELANIM = 16,'));
const gridPreview = read('src/web/admin/tiles/grid-preview.js');
assert.ok(gridPreview.includes("KEEPS_OWN_COLOR_TYPES = ['9', '10', '16']") || gridPreview.includes("KEEPS_OWN_COLOR_TYPES = ['9','10','16']"),
  'The preview keeps the same three types');
assert.ok(gridPreview.includes('const isDefaultBg = tileBgFollowsDefault(tile.bg_color) || !tileTypeKeepsOwnColor(typeValue);'));
assert.ok(read('src/web/admin/tiles/live-preview.js').includes('const isDefaultBg = tileColorInputIsDefault(tab) || !tileTypeKeepsOwnColor(type);'));
const html = read('src/web/server/render/web_admin_html.cpp');
assert.ok(html.includes('(tileBgColorFollowsDefault(tile.bg_color) || !tileTypeKeepsOwnColor(tile.type)) &&'),
  'The server preview draws icon tiles on the theme card too');
for (const type of ['binary_sensor', 'camera', 'climate', 'clock', 'cover', 'energy', 'media', 'navigate', 'scene', 'sensor', 'switch', 'text', 'weather']) {
  const source = read(`src/types/${type}/renderer.cpp`);
  assert.match(source, /tileBgColorOrDefault\(\*?tile, tileDefaultBgColor\(\)\)/, `${type} uses the theme card`);
  assert.doesNotMatch(source, /tileBgColorOrDefault\([^)]*0x2A2A2A\)/, `${type} must not hard-code the default color`);
}
assert.match(read('src/types/pixelanim/renderer.cpp'), /tileBgColorOrDefault\(tile, 0x000000\)/, 'Pixel animation keeps its black default');
const registry = read('src/types/types_registry.cpp');
assert.match(registry, /return tile_color::isDefaultGrey\(entry\.default_bg_color\);/);
assert.match(registry, /if \(follows_default_tile_color\(entry\)\) html \+= "sharedBg:true,";/);

// A stored built-in default grey (older editors saved it explicitly) follows
// the theme card like an unset color, on the device and in the preview.
const follows = new Function(`${extractFunction('isDefaultTileGrey', gridPreview)}
${extractFunction('tileBgFollowsDefault', gridPreview)}; return tileBgFollowsDefault;`)();
const firmwareFollows = stored => stored === 0 || [0x1A1A1A, 0x222222, 0x2A2A2A].includes(stored & 0xFFFFFF);
for (const value of [0, 0x012A2A2A, 0x01222222, 0x011A1A1A, 0x01353535, 0x01000000, 0x01FF0000]) {
  assert.equal(follows(value), firmwareFollows(value), `preview follows like the device for ${value}`);
}

// No settings, routes or handlers for the fixed values.
const config = read('src/core/config/config_manager.h') + read('src/core/config/config_manager.cpp');
for (const save of ['saveTileRadius', 'saveIconDiscs', 'saveIconGlow', 'saveDefaultTileColor']) {
  assert.ok(!config.includes(save + '('), `ConfigManager has no ${save}`);
}
const handlers = read('src/web/server/handlers/web_admin_handlers.cpp') + read('src/web/server/web_admin.h');
for (const handler of ['handleTileRadius', 'handleSaveIconDiscs', 'handleSaveIconGlow', 'handleSaveDefaultTileColor']) {
  assert.ok(!handlers.includes(handler), `No ${handler}`);
}
const routes = read('src/web/server/web_admin.cpp');
for (const route of ['tile-radius', 'icon-discs', 'icon-glow', 'tile-color']) {
  assert.ok(!routes.includes(`"/api/display/${route}"`), `No /api/display/${route}`);
}
assert.ok(routes.includes('"/api/display/tile-borders"') && routes.includes('"/api/display/theme"'), 'Borders and theme stay');

// Web Admin global block: borders, layout and theme, in the Tile Settings
// style; no radius, circle, strength or tile color field.
for (const marker of [
  'global_panel += "<section class=\\"global-settings-panel\\"><h3>";',
  'appendHtmlEscaped(global_panel, tr.panel_tab_global);',
  '"<input class=\\"normal-tile-border-toggle\\" id=\\"" +',
  'appendHtmlEscaped(global_panel, tr.screensaver_tile_border);',
  'global_panel += "</label><button type=\\"button\\" class=\\"layout-choice\\" onclick=\\"openLayoutWindow()\\" title=\\"";',
  // The design as a segmented choice like Tile | Global (user 2026-10-11).
  'global_panel += "<button type=\\"button\\" data-theme=\\"" + String(theme) + "\\" onclick=\\"saveTheme(\'" +',
  '"<input id=\\"screensaverTileBorder\\" type=\\"checkbox\\"> ";',
  // The gesture menu (swipe_gestures.h): one select per edge, top first, in
  // the same grid as the fields above so every label lines up.
  'global_panel += "<div class=\\"gesture-settings\\"><div class=\\"tile-settings-group\\">";',
  'appendHtmlEscaped(global_panel, tr.swipe_gestures_heading);',
  'const uint8_t order[swipe_gestures::kEdgeCount] = {2, 3, 0, 1};',
  '"\\" onchange=\\"saveGestureEdge(this)\\">";',
]) assert.ok(html.includes(marker), `global panel HTML: ${marker}`);
assert.doesNotMatch(html, /global-icon-disc-toggle|global-tile-radius|global-icon-glow|global-tile-color|icon-discs-off|saveIconGlow|saveTileRadius|saveIconDiscs|saveDefaultTileColor/,
  'No removed global field');
const display = read('src/web/admin/settings/display-borders.js');
assert.doesNotMatch(display, /\/api\/display\/(icon-discs|icon-glow|tile-color|tile-radius)|function (saveIconDiscs|saveIconGlow|saveDefaultTileColor|saveTileRadius|syncTileRadiusControls)\b/);
assert.ok(display.includes('function syncGlobalDisplayControls(tabEl) {'));
const navigation = read('src/web/admin/folders/navigation.js');
assert.ok(navigation.includes('syncGlobalDisplayControls(tabEl);') && !navigation.includes('syncTileRadiusControls'));

// The previews read the fixed values from the root variables.
const styles = read('src/web/server/render/web_admin_styles.cpp');
assert.ok(styles.includes('const uint8_t glow = ui_surface_style::icon_glow_percent();'));
assert.ok(styles.includes('snprintf(color_hex, sizeof(color_hex), "#%06X", static_cast<unsigned>(tile_color::kDefault));'));
assert.ok(styles.includes('emit_scaled("tile-radius", tile_radius::kDefault);'));
assert.ok(styles.includes('html += String(tile_radius::kDefault);'));
assert.ok(styles.includes('html += "--tile-card:var(--tile-default-bg);--pv-black-tile:#000000;";'));
assert.ok(gridPreview.includes("const cardCss = shared ? 'var(--tile-card, #2A2A2A)' : black ? 'var(--pv-black-tile, #000000)' : hex;"));
assert.ok(gridPreview.includes('const discOpa = Math.floor((percent * 255 + 50) / 100);'), 'Preview uses the device veil formula');

// The global block's look.
const css = read('src/web/assets/admin.css');
assert.match(css, /\.global-settings-panel \{\s*flex:0 0 100%;\s*box-sizing:border-box;\s*background:var\(--panel\);\s*border:1px solid #232323;\s*border-radius:18px;\s*padding:20px;/,
  'Same card as the Tile Settings panel');
assert.match(css, /\.global-settings-grid \{\s*display:grid;\s*grid-template-columns:repeat\(2, minmax\(0, 1fr\)\);/, 'Two compact columns');
assert.ok(css.includes('@media (max-width:520px) { .global-settings-grid { grid-template-columns:minmax(0, 1fr); } }'), 'One column on phones');
assert.doesNotMatch(css, /icon-discs-off|global-radius-field|global-tile-color-field|global-icon-glow-value/, 'No styles of removed fields');

// Tile color of a tile without an icon: Global (the theme card) or Custom.
for (const marker of [
  '<div class="tile-color-row no-reset" id=")html";',
  '_tile_color_modes">)html";',
  '{{"global", tr.tile_color_mode_global},',
  '{"custom", tr.tile_color_mode_custom}};',
  'html += R"html(" onclick="setTileColorMode(\')html";',
  'append_tile_color_from_icon_html(html, tab_id);',
]) assert.ok(html.includes(marker), `tile color HTML: ${marker}`);
assert.doesNotMatch(html, /\{"icon", tr\.|\{"cover", tr\.tile_color_mode_from_cover\}/, 'No From icon / From cover tile color modes');
assert.match(gridPreview, /function setTileColorMode\(tab, mode\) \{[\s\S]*?input\.dataset\.bgColorDefault = '1';[\s\S]*?scheduleAutoSave\(tab\);/);
assert.match(gridPreview, /function markTileColorInputExplicit\(tab\) \{[\s\S]*?input\.dataset\.bgColorDefault = '0';[\s\S]*?syncTileColorMode\(tab\);/);

// Translations: the heading in every language; removed labels are gone.
const i18nHeader = read('src/core/i18n/i18n.h');
const i18n = read('src/core/i18n/i18n.cpp');
const fields = [...i18nHeader.slice(i18nHeader.indexOf('struct Strings {')).matchAll(/const char\* (\w+);/g)].map(m => m[1]);
for (const gone of ['icon_discs', 'default_tile_color', 'icon_glow_strength', 'icon_glow', 'tile_radius', 'icon_disc_label',
  'tile_color_mode_from_icon', 'tile_rules_tint_tile', 'tile_rules_strength', 'tile_rules_color_icon', 'tile_rules_tile_follows_icon']) {
  assert.ok(!fields.includes(gone), `Strings.${gone} is gone`);
}
const tables = ['kStringsDe', 'kStringsEn', 'kStringsFr'].map(name => {
  const start = i18n.indexOf(`static const Strings ${name} = {`);
  const body = i18n.slice(start, i18n.indexOf('\n};', start));
  return [...body.matchAll(/^\s*"((?:[^"\\]|\\.)*)",?\s*$/gm)].map(m => m[1]);
});
// Every pane's heading is its tab's name (user 2026-10-13: no "settings").
const heading = fields.indexOf('panel_tab_global');
['Global', 'Global', 'Global'].forEach((text, language) =>
  assert.equal(tables[language][heading], text, `panel_tab_global [${language}]`));
assert.equal(fields.indexOf('global_settings_heading'), -1, 'No "Global settings" heading left');
assert.equal(fields.indexOf('admin_tile_settings'), -1, 'No "Tile settings" heading left');

console.log('Global display settings: borders, layout and theme only; fixed tile color, circles and radius on device and preview');
