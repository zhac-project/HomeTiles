// LVGL host test for the background photo's shared surface styles: the tile
// layers turn transparent over a photo and the tile cards take the tile
// opacity, starting from each card's own rendered opacity.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {lvglHost} from '../../lib/lvgl-host.mjs';
import {radiusPolicyHost, surfaceStyleHost} from '../../lib/surface-style-host.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const host = await lvglHost(root);
if (!host) {
  console.log('SKIP: Background surface style requires LVGL and a host compiler');
  process.exit(0);
}
const out = path.join(root, 'build/tests/background-surface-style');
fs.mkdirSync(out, {recursive: true});
const source = path.join(out, 'test.cpp');
const binary = path.join(out, process.platform === 'win32' ? 'test.exe' : 'test');
fs.writeFileSync(source, String.raw`
#include <lvgl.h>
#include <cassert>
#include <vector>
${radiusPolicyHost(root)}
#include "src/core/config/icon_glow.h"
struct TestConfig { int tile_radius = tile_radius::kMinimum; bool tile_borders = true; bool icon_discs = true; uint8_t icon_glow = icon_glow::kDefault; };
struct TestConfigManager { TestConfig config; const TestConfig& getConfig() const { return config; } } configManager;
${surfaceStyleHost(root)}
using namespace ui_surface_style;
static lv_opa_t opa(lv_obj_t* obj, lv_state_t state) {
  lv_obj_add_state(obj, state);
  const lv_opa_t value = lv_obj_get_style_bg_opa(obj, LV_PART_MAIN);
  lv_obj_remove_state(obj, state);
  return value;
}
static int layer_style_changes = 0;
static bool is_black(lv_color_t c) { return c.red == 0 && c.green == 0 && c.blue == 0; }
static lv_obj_t* card_with(lv_opa_t value) {
  lv_obj_t* card = lv_button_create(lv_screen_active());
  lv_obj_set_style_bg_opa(card, value, 0);  // a local value, like a renderer
  return card;
}
int main() {
  lv_init();
  auto* display = lv_display_create(800, 480);
  std::vector<uint16_t> band(800 * 16);
  lv_display_set_color_format(display, LV_COLOR_FORMAT_RGB565);
  lv_display_set_buffers(display, band.data(), nullptr, band.size() * 2, LV_DISPLAY_RENDER_MODE_PARTIAL);
  lv_display_set_flush_cb(display, [](lv_display_t* d, const lv_area_t*, uint8_t*) { lv_display_flush_ready(d); });
  lv_theme_default_init(display, lv_color_hex(0x26A69A), lv_color_hex(0xC14444), false, LV_FONT_DEFAULT);

  lv_obj_t* layer = lv_obj_create(lv_screen_active());
  lv_obj_set_style_bg_opa(layer, LV_OPA_TRANSP, 0);  // an earlier local value must not win
  apply_backdrop(layer);
  assert(lv_obj_get_style_bg_opa(layer, LV_PART_MAIN) == LV_OPA_COVER && is_black(lv_obj_get_style_bg_color(layer, LV_PART_MAIN)));
  assert(!photo_backdrop_shown());
  lv_obj_t* card = card_with(LV_OPA_COVER);
  apply_tile_card_background(card, false);  // no photo: as today
  assert(opa(card, LV_STATE_DEFAULT) == 255 && opa(card, LV_STATE_PRESSED) == 255);

  // Cached and hidden grids share the style: a change must reach them.
  lv_obj_add_event_cb(layer, [](lv_event_t*) { ++layer_style_changes; }, LV_EVENT_STYLE_CHANGED, nullptr);
  set_photo_backdrop(true, 60);
  assert(photo_backdrop_shown() && layer_style_changes > 0);
  assert(lv_obj_get_style_bg_opa(layer, LV_PART_MAIN) == LV_OPA_TRANSP);
  apply_tile_card_background(card, false);
  assert(opa(card, LV_STATE_DEFAULT) == 153 && opa(card, LV_STATE_PRESSED) == 204);
  lv_obj_t* clock = card_with(LV_OPA_COVER);
  apply_tile_card_background(clock, true);
  assert(opa(clock, LV_STATE_DEFAULT) == 0 && opa(clock, LV_STATE_PRESSED) == 127);
  lv_obj_t* clear = card_with(LV_OPA_TRANSP);
  apply_tile_card_background(clear, false);
  assert(opa(clear, LV_STATE_DEFAULT) == 0 && opa(clear, LV_STATE_PRESSED) == 0);
  set_photo_backdrop(true, 100);
  lv_obj_t* full = card_with(LV_OPA_COVER);
  apply_tile_card_background(full, false);
  assert(opa(full, LV_STATE_DEFAULT) == 255 && opa(full, LV_STATE_PRESSED) == 255);

  set_photo_backdrop(false, 60);
  assert(!photo_backdrop_shown());
  assert(lv_obj_get_style_bg_opa(layer, LV_PART_MAIN) == LV_OPA_COVER);

  // The cardless clock keeps its border hidden through a global refresh. The
  // hairline is an outline; the border width is always 0.
  apply_global_tile_border(clock);
  disable_tile_border(clock);
  request_global_tile_border_refresh();
  process_pending_updates();
  assert(lv_obj_get_style_border_width(clock, LV_PART_MAIN) == 0 && lv_obj_get_style_outline_width(clock, LV_PART_MAIN) == 0);
  lv_deinit();
}
`);
let result = spawnSync(host.cxx, [...host.flags, '-std=c++17', source, host.archive, '-o', binary], {encoding: 'utf8'});
assert.equal(result.status, 0, result.stdout + result.stderr);
result = spawnSync(binary, [], {encoding: 'utf8'});
assert.equal(result.status, 0, result.stdout + result.stderr);
console.log('Background surface style: layers follow the photo, cards take the tile opacity, pressed cards stay visible, the clock drops its card');
