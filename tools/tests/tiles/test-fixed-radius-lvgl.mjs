import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {lvglHost} from '../../lib/lvgl-host.mjs';
import {surfaceStyleHost} from '../../lib/surface-style-host.mjs';

// The tile radius is fixed (user 2026-10-11: no global radius setting): every
// card, popup and inset control takes it from tile_radius::kDefault, on
// every profile, without any setting, NVS key or Web Admin route.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const config = read('src/core/config/config_manager.h') + read('src/core/config/config_manager.cpp');
for (const field of ['tile_radius', 'icon_discs', 'icon_glow', 'default_tile_color']) {
  assert.doesNotMatch(config, new RegExp('\\b(config|normalized|a|b)\\.' + field + '\\b|^\\s*\\w+ ' + field + '\\b', 'm'),
    'ConfigManager has no ' + field + ' any more');
}
for (const save of ['saveTileRadius', 'saveIconDiscs', 'saveIconGlow', 'saveDefaultTileColor']) {
  assert.ok(!config.includes(save + '('), 'ConfigManager has no ' + save + ' any more');
}
const routes = read('src/web/server/web_admin.cpp');
for (const route of ['tile-radius', 'icon-discs', 'icon-glow', 'tile-color']) {
  assert.ok(!routes.includes('/api/display/' + route), 'No /api/display/' + route + ' route any more');
}
const surface = read('src/ui/shared/ui_surface_style.cpp');
assert.doesNotMatch(surface, /preview_radius|request_global_radius_refresh|getConfig\(\)\.(tile_radius|icon_glow|icon_discs)/);

const host = await lvglHost(root);
if (!host) { console.log('SKIP: Fixed radius needs native LVGL'); process.exit(0); }
const out = path.join(root, 'build/tests/fixed-radius');
fs.mkdirSync(out, {recursive:true});
fs.writeFileSync(path.join(out, 'FS.h'), '#pragma once\nnamespace fs {class FS{};}\n');
fs.writeFileSync(path.join(out, 'Arduino.h'), '#pragma once\n#include <cstdint>\n#include <cstddef>\n');
const cpp = `
#include <lvgl.h>
#include <cassert>
#include <vector>
#include "src/core/config/tile_radius.h"
#include "src/types/climate/layout.h"
#include "src/ui/shared/ui_theme.h"
struct Config{bool tile_borders=true;};
struct ConfigManager {Config config; const Config& getConfig(){return config;}} configManager;
${surfaceStyleHost(root)}
int main(){
 // The fixed radius is the round half tile of every profile.
 assert(tile_radius::kDefault==tile_radius::kMaximum);
 assert(tile_radius::kMaximum==(Device::kGridCellH-Device::kGridGap+2)/4);
 lv_init(); auto*d=lv_display_create(Device::kScreenWidth,Device::kScreenHeight);
 std::vector<uint16_t> buffer(Device::kScreenWidth*16);
 lv_display_set_color_format(d,LV_COLOR_FORMAT_RGB565);
 lv_display_set_buffers(d,buffer.data(),nullptr,buffer.size()*2,LV_DISPLAY_RENDER_MODE_PARTIAL);
 lv_display_set_flush_cb(d,[](lv_display_t*d,const lv_area_t*,uint8_t*){lv_display_flush_ready(d);});
 auto*screen=lv_obj_create(nullptr);auto*outer=lv_obj_create(screen);auto*inner=lv_obj_create(outer);
 lv_obj_set_size(outer,Device::kGridCellW,Device::kGridCellH);
 lv_obj_set_size(inner,Device::kGridCellW-2*climate_layout::kOuterInset,50);
 ui_surface_style::apply_radius(outer,tile_radius::kMinimum);
 ui_surface_style::apply_radius(inner,climate_layout::kControlRadius);
 auto*popup=lv_obj_create(lv_layer_top());ui_surface_style::apply_radius(popup,tile_radius::kMinimum);
 const int r=tile_radius::kDefault;
 assert(lv_obj_get_style_radius(outer,LV_PART_MAIN)==r && lv_obj_get_style_radius(popup,LV_PART_MAIN)==r);
 // An inset control stays concentric with its card.
 assert(lv_obj_get_style_radius(inner,LV_PART_MAIN)+climate_layout::kOuterInset==r);
 lv_obj_add_state(outer,LV_STATE_PRESSED);assert(lv_obj_get_style_radius(outer,LV_PART_MAIN)==r);lv_obj_remove_state(outer,LV_STATE_PRESSED);
 // Nothing pending changes it later.
 ui_surface_style::process_pending_updates();
 assert(lv_obj_get_style_radius(outer,LV_PART_MAIN)==r && lv_obj_get_style_radius(inner,LV_PART_MAIN)+climate_layout::kOuterInset==r);
 lv_obj_delete(screen);lv_deinit();
}
`;
const source = path.join(out, 'test.cpp'); fs.writeFileSync(source, cpp);
for (const {buildProfile, define} of JSON.parse(read('tools/device-profiles.json')).profiles) {
  const binary = path.join(out, buildProfile + (process.platform === 'win32' ? '.exe' : ''));
  const built = spawnSync(host.cxx, [...host.flags, '-std=c++17', '-I', out, '-DHOMETILES_CI_TARGET', `-D${define}`, source, host.archive, '-o', binary], {encoding:'utf8'});
  assert.equal(built.status, 0, built.stdout + built.stderr);
  const run = spawnSync(binary, [], {encoding:'utf8'}); assert.equal(run.status, 0, buildProfile + run.stdout + run.stderr);
}
console.log('Fixed radius: no radius/circle/tile color settings, every profile draws cards, popups and concentric controls with tile_radius::kDefault');
