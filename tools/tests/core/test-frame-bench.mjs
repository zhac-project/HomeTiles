import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {lvglHost} from '../../lib/lvgl-host.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// Contract: the bench is diagnostic and never reaches a default build.
const bench = read('src/core/diagnostics/frame_bench.cpp').replace(/\/\/.*$/gm, '').trim();
assert.match(bench, /^#include "src\/core\/diagnostics\/frame_bench\.h"\s*#if defined\(HOMETILES_BENCH_FRAMES\)[\s\S]*#endif$/,
  'frame_bench.cpp is wrapped in HOMETILES_BENCH_FRAMES');
assert.match(read('src/core/diagnostics/frame_bench.h'),
  /#if defined\(HOMETILES_BENCH_FRAMES\)[\s\S]*#else[\s\S]*inline void begin\(\) \{\}[\s\S]*inline void folder_open_requested\(\) \{\}[\s\S]*#endif/,
  'the header has inline no-ops for the default build');
assert.match(read('tools/build-profile.sh'), /^\s*common="[^\n]*\$\{EXTRA_FLAGS:-\}"$/m, 'build-profile.sh passes EXTRA_FLAGS');
assert.match(read('HomeTiles.ino'), /background_photo::begin\(\);\s*frame_bench::begin\(\);/, 'setup starts the bench');
assert.match(read('src/ui/tabs/tiles/tab_tiles_unified.cpp'),
  /g_pending_folder_id = folder_id;\s*g_folder_switch_pending = true;\s*frame_bench::folder_open_requested\(\);/,
  'a folder tap starts the folder-open clock');

const host = await lvglHost(root);
if (!host) {
  console.log('SKIP: frame bench behaviour requires LVGL and a host compiler (contract passed)');
  process.exit(0);
}
const out = path.join(root, 'build/tests/frame-bench');
fs.mkdirSync(path.join(out, 'src/ui/tabs/tiles'), {recursive: true});
fs.writeFileSync(path.join(out, 'Arduino.h'), `#pragma once
#include <cstdint>
#include <string>
#include <vector>
uint32_t micros();
uint32_t millis();
struct BenchSerial { std::vector<std::string> lines; void printf(const char* format, ...); };
extern BenchSerial Serial;
`);
// Shadows the real header: -I out comes first.
fs.writeFileSync(path.join(out, 'src/ui/tabs/tiles/tab_tiles_unified.h'), `#pragma once
#include <lvgl.h>
bool tiles_folder_switch_pending();
lv_obj_t* tiles_active_grid();
`);
const cpp = String.raw`
#include <Arduino.h>
#include <lvgl.h>
#include <lvgl_private.h>
#include <cassert>
#include <cstdarg>
#include <cstdio>
#define HOMETILES_BENCH_FRAMES
#include "src/core/diagnostics/frame_bench.h"
#include "src/ui/tabs/tiles/tab_tiles_unified.h"
uint32_t now_us = 0;
uint32_t micros() { return now_us; }
uint32_t millis() { return now_us / 1000; }
BenchSerial Serial;
void BenchSerial::printf(const char* format, ...) {
  char buffer[160];
  va_list args;
  va_start(args, format);
  vsnprintf(buffer, sizeof(buffer), format, args);
  va_end(args);
  lines.emplace_back(buffer);
}
bool pending = false;
lv_obj_t* grid = nullptr;
bool tiles_folder_switch_pending() { return pending; }
lv_obj_t* tiles_active_grid() { return grid; }
lv_display_t* display = nullptr;
void pass(uint32_t start_us, uint32_t us, bool render = true) {
  now_us = start_us;
  lv_display_send_event(display, LV_EVENT_REFR_START, nullptr);
  if (render) lv_display_send_event(display, LV_EVENT_RENDER_START, nullptr);
  now_us = start_us + us;
  lv_display_send_event(display, LV_EVENT_REFR_READY, nullptr);
}
void timers_at(uint32_t ms) { now_us = ms * 1000; lv_timer_handler(); }
int count(const char* prefix) {
  int n = 0;
  for (const auto& line : Serial.lines) n += line.rfind(prefix, 0) == 0;
  return n;
}
bool logged(const char* line) {
  for (const auto& entry : Serial.lines) if (entry == line) return true;
  return false;
}
int main() {
  lv_init();
  lv_tick_set_cb([]() -> uint32_t { return now_us / 1000; });
  display = lv_display_create(480, 480);
  grid = lv_obj_create(lv_screen_active());
  lv_obj_set_size(grid, 480, 480);
  lv_obj_t* cards[3];
  for (int i = 0; i < 3; ++i) {
    cards[i] = lv_obj_create(grid);
    lv_obj_set_pos(cards[i], 10 + i * 150, 10);
    lv_obj_set_size(cards[i], 140, 140);
  }
  lv_obj_update_layout(grid);
  frame_bench::begin();

  pass(1000000, 4000);
  pass(2000000, 500, false);
  pass(3000000, 10000);
  timers_at(5000);
  assert(logged("[BENCH] win frames=2 avg_us=7000 max_us=10000\n") && "an empty timer pass is not a frame");
  timers_at(10000);
  assert(count("[BENCH] win") == 1 && "a window without frames logs nothing");

  pending = true;
  now_us = 11000000;
  frame_bench::folder_open_requested();
  pass(11010000, 3000);
  assert(count("[BENCH] folder_open_ms") == 0 && "frames before the switch do not count");
  pending = false;
  pass(11200000, 1000, false);
  pass(11240000, 10000);
  assert(logged("[BENCH] folder_open_ms=250\n") && "the first rendered frame after the switch");
  pass(11300000, 1000);
  assert(count("[BENCH] folder_open_ms") == 1 && "one time per folder tap");

  timers_at(15000);
  timers_at(20000);
  timers_at(25000);
  for (int k = 0; k < 20; ++k) {
    display->inv_p = 0;
    timers_at(30000 + k * 100);
    assert(display->inv_p == 1 && "each burst step redraws one card");
    const lv_area_t& area = display->inv_areas[0];
    const lv_point_t center{(area.x1 + area.x2) / 2, (area.y1 + area.y2) / 2};
    assert(lv_area_is_point_on(&cards[k % 3]->coords, &center, 0) && "the next card of the active grid");
    pass(now_us + 1000, 5000);
  }
  assert(count("[BENCH] burst") == 0 && "the last card gets a full step to render");
  display->inv_p = 0;
  timers_at(32000);
  assert(display->inv_p == 0 && "20 cards per burst");
  assert(logged("[BENCH] burst frames=20 avg_us=5000 max_us=5000\n"));
  timers_at(32100);
  timers_at(32200);
  assert(count("[BENCH] burst") == 1 && display->inv_p == 0 && "the burst stops after logging");
  lv_deinit();
}
`;
const source = path.join(out, 'test.cpp');
const binary = path.join(out, process.platform === 'win32' ? 'test.exe' : 'test');
fs.writeFileSync(source, cpp);
let r = spawnSync(host.cxx, ['-I', out, ...host.flags, '-std=c++17', source,
  path.join(root, 'src/core/diagnostics/frame_bench.cpp'), '-DHOMETILES_BENCH_FRAMES', host.archive, '-o', binary],
  {encoding: 'utf8'});
assert.equal(r.status, 0, r.stdout + r.stderr);
r = spawnSync(binary, [], {encoding: 'utf8'});
assert.equal(r.status, 0, r.stdout + r.stderr);
console.log('Frame bench: default build untouched; window, folder-open and burst timings');
