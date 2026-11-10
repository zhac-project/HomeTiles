// Source contract for the background photo runtime: listing and checks read
// only the microSD /images folder, the decode runs once in a one-shot LVGL
// timer, the photo sits behind the tile layers, and settings are never written.
import assert from 'node:assert/strict';

import {readRepoFile} from '../../lib/admin-source.mjs';
import {cppFunctionDefinitions} from '../../lib/cpp-source.mjs';

const src = readRepoFile('src', 'ui', 'background', 'background_photo.cpp');
const definitions = cppFunctionDefinitions(src);
const fn = (name) => {
  const found = definitions.find((definition) => definition.name === name);
  assert.ok(found, `${name} is missing`);
  return found.body;
};

const list = fn('list');
for (const needle of ['Device::sdReadyCached()', 'Device::sdFS()', '"/images"', 'background_rules::is_listed_name(',
  'background_rules::kMaxListed', 'background_rules::compare_names', 'jpeg_probe::probe(']) {
  assert.ok(list.includes(needle), `list uses ${needle}`);
}
assert.ok(!list.includes('storageFS(') && !list.includes('"/wallpapers"'), 'only the card /images folder');
assert.ok(fn('check').includes('Device::sdReadyCached()'));
assert.ok(!src.includes('saveBackground(') && !src.includes('configManager.save'), 'the runtime never writes settings');

// One decode, in a one-shot timer callback, never inline in process_pending.
assert.equal(src.split('image_screensaver_decode_full_cover(').length - 1, 1);
const decoders = definitions.filter((definition) =>
  /^static void \w+\(lv_timer_t\*/.test(definition.source) &&
  definition.body.includes('image_screensaver_decode_full_cover('));
assert.equal(decoders.length, 1, 'the decode runs inside a static lv_timer callback');
assert.ok(!fn('process_pending').includes('image_screensaver_decode_full_cover('));

for (const needle of ['lv_obj_move_to_index(', 'LV_OBJ_FLAG_CLICKABLE', 'set_photo_backdrop(', 'tiles_invalidate_folder(',
  'tiles_request_reload_all(', 'std::atomic<bool>', 'background_rules::finish_pixels(']) {
  assert.ok(src.includes(needle), `background_photo.cpp uses ${needle}`);
}

assert.ok(readRepoFile('src', 'devices', 'device.h').includes('inline constexpr uint8_t kTileOpacityPercentMin = 0;'));
const ino = readRepoFile('HomeTiles.ino');
const preload = ino.indexOf('preload_image_screensaver();');
assert.ok(preload >= 0 && ino.indexOf('background_photo::begin();') > preload, 'begin() runs after the screensaver preload');
const reload = cppFunctionDefinitions(readRepoFile('src', 'ui', 'tabs', 'tiles', 'tab_tiles_unified.cpp'))
  .find((definition) => definition.name === 'tiles_process_reload_requests');
assert.ok(reload, 'tiles_process_reload_requests is missing');
assert.match(reload.body, /ui_surface_style::process_pending_updates\(\);\s*background_photo::process_pending\(\);/);

console.log('background photo runtime source contract: PASS');
