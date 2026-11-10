// A tile's press (tile_press.h, user 2026-10-13). The input holds a tile's
// press back until the finger rested (touch_rules::kPressDelayMs); the
// theme's 80 ms fade in on top brought the full press color only about
// 150 ms after the touch ("it came too late"), so it shows at once. Letting
// go still fades back after the theme's delay, but a touch that became a
// swipe takes the press away at once: its fade back from the full color
// glowed along every swipe that began slowly ("now one sees the glow when
// swiping"). A circle following the card (follow_card_state) goes with it.
// Runs the production header on RGB565 with the device theme.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {lvglHost} from '../../lib/lvgl-host.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
// Every tile card, its circles and resting controls, and the touch's cancel.
assert.match(read('src/tiles/runtime/tile_renderer.cpp'), /disable_pressed_recolor\(tile_obj\);\s*tile_press::apply\(tile_obj\);/);
assert.match(read('src/tiles/runtime/tile_icon_disc.h'),
  /inline void fade_with_card\(lv_obj_t\* obj\) \{ tile_press::apply\(obj\); \}/);
assert.match(read('src/ui/ui_manager.cpp'), /if \(touch_moved\) \{[^}]*if \(touch_press_shown\) tile_press::off_at_once\(obj\);/);
const host = await lvglHost(root);
if (!host) {
  console.log('SKIP: Tile press needs LVGL and a host compiler');
  process.exit(0);
}
const out = path.join(root, 'build/tests/tile-press-at-once');
fs.mkdirSync(out, {recursive: true});
const cpp = String.raw`
#include <lvgl.h>
#include <cstdio>
#include "src/tiles/runtime/tile_press.h"
static uint16_t fb[300 * 100];
static uint32_t px(int x, int y) {
  const uint16_t c = fb[y * 300 + x];
  const unsigned r = (c >> 11) & 31, g = (c >> 5) & 63, b = c & 31;
  return ((r * 527 + 23) >> 6) << 16 | ((g * 259 + 33) >> 6) << 8 | ((b * 527 + 23) >> 6);
}
static void frame(lv_display_t* d, uint32_t ms) { lv_tick_inc(ms); lv_timer_handler(); lv_refr_now(d); }
// follow_card_state (tile_icon_disc.h): the circle takes the card's state.
static void follow(lv_event_t* e) {
  lv_obj_t* card = static_cast<lv_obj_t*>(lv_event_get_current_target(e));
  lv_obj_set_state(lv_obj_get_child(card, 0), LV_STATE_PRESSED, lv_obj_has_state(card, LV_STATE_PRESSED));
}
static bool pressed(uint32_t card, uint32_t disc) { return card == 0x292829 && disc == 0x4A494A; }
int main() {
  lv_init();
  lv_display_t* d = lv_display_create(300, 100);
  lv_display_set_color_format(d, LV_COLOR_FORMAT_RGB565);
  lv_display_set_buffers(d, fb, nullptr, sizeof(fb), LV_DISPLAY_RENDER_MODE_DIRECT);
  lv_display_set_flush_cb(d, [](lv_display_t* disp, const lv_area_t*, uint8_t*) { lv_display_flush_ready(disp); });
  lv_display_set_theme(d, lv_theme_default_init(d, lv_color_hex(0x26A69A), lv_color_hex(0xC14444), false, LV_FONT_DEFAULT));
  // Three button tiles with a circle: the theme's own, and two tiles.
  lv_obj_t* cards[3];
  for (int i = 0; i < 3; ++i) {
    lv_obj_t* card = lv_button_create(lv_screen_active());
    lv_obj_set_size(card, 90, 90);
    lv_obj_set_pos(card, 5 + i * 100, 5);
    lv_obj_set_style_shadow_width(card, 0, 0);
    lv_obj_set_style_recolor_opa(card, LV_OPA_TRANSP, LV_STATE_PRESSED);
    lv_obj_set_style_pad_all(card, 0, 0);
    lv_obj_set_style_bg_color(card, lv_color_hex(0x1A1A1A), 0);
    lv_obj_set_style_bg_color(card, lv_color_hex(0x2A2A2A), LV_STATE_PRESSED);
    lv_obj_t* disc = lv_obj_create(card);
    lv_obj_remove_style_all(disc);
    lv_obj_set_size(disc, 30, 30);
    lv_obj_align(disc, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_bg_opa(disc, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(disc, lv_color_hex(0x3A3A3A), 0);
    lv_obj_set_style_bg_color(disc, lv_color_hex(0x4A4A4A), LV_STATE_PRESSED);
    lv_obj_add_event_cb(card, follow, LV_EVENT_STATE_CHANGED, nullptr);
    if (i) { tile_press::apply(card); tile_press::apply(disc); }
    cards[i] = card;
  }
  frame(d, 10);
  const uint32_t rest = px(150, 70), disc_rest = px(115, 20);
  for (lv_obj_t* card : cards) lv_obj_add_state(card, LV_STATE_PRESSED);
  frame(d, 17);
  frame(d, 17);
  std::printf("in: theme #%06X, tile #%06X circle #%06X\n", (unsigned)px(50, 70), (unsigned)px(150, 70), (unsigned)px(115, 20));
  if (px(50, 70) == 0x292829) { std::printf("FAIL the theme no longer fades in: the test lost its point\n"); return 1; }
  if (!pressed(px(150, 70), px(115, 20))) { std::printf("FAIL the tile's press is not there at once\n"); return 1; }
  // Let go (tile 1) and a swipe took it over (tile 2).
  lv_obj_remove_state(cards[1], LV_STATE_PRESSED);
  tile_press::off_at_once(cards[2]);
  frame(d, 17);
  frame(d, 17);
  const uint32_t held = px(150, 70), held_disc = px(115, 20), gone = px(250, 70), gone_disc = px(215, 20);
  std::printf("after 34 ms: let go #%06X/#%06X, swiped #%06X/#%06X\n", (unsigned)held, (unsigned)held_disc, (unsigned)gone, (unsigned)gone_disc);
  if (!pressed(held, held_disc)) { std::printf("FAIL letting go no longer waits the theme's delay\n"); return 1; }
  if (gone != rest || gone_disc != disc_rest) { std::printf("FAIL a swiped press still glows\n"); return 1; }
  for (int t = 0; t < 300; t += 10) frame(d, 10);
  if (px(150, 70) != rest || px(115, 20) != disc_rest) { std::printf("FAIL the tile did not go back to rest\n"); return 1; }
  // The next press and release fade as before (the delay was given back).
  lv_obj_add_state(cards[2], LV_STATE_PRESSED);
  frame(d, 17);
  lv_obj_remove_state(cards[2], LV_STATE_PRESSED);
  frame(d, 17);
  if (!pressed(px(250, 70), px(215, 20))) { std::printf("FAIL the swipe's cancel changed the next release\n"); return 1; }
  std::printf("OK\n");
  return 0;
}
`;
const src = path.join(out, 'test.cpp');
const binary = path.join(out, process.platform === 'win32' ? 'test.exe' : 'test');
fs.writeFileSync(src, cpp);
let result = spawnSync(host.cxx, [...host.flags, '-std=c++17', src, host.archive, '-o', binary], {encoding: 'utf8'});
assert.equal(result.status, 0, result.stdout + result.stderr);
result = spawnSync(binary, [], {encoding: 'utf8'});
assert.equal(result.status, 0, result.stdout + result.stderr);
console.log('Tile press: at once in, faded back on letting go, gone at once when a swipe takes it');
console.log(result.stdout.trim());
