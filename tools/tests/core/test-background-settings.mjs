// Source contract for the background photo settings in NVS: the three
// DeviceConfig fields, their keys in load, save() and saveBackground, the
// normalization on load and save(), both defaults sites, and the no-op guard
// before saveBackground opens a storage write.
import assert from 'node:assert/strict';

import {readRepoFile} from '../../lib/admin-source.mjs';
import {cppFunctionDefinitions} from '../../lib/cpp-source.mjs';

const h = readRepoFile('src', 'core', 'config', 'config_manager.h');
const cpp = readRepoFile('src', 'core', 'config', 'config_manager.cpp');
const definitions = cppFunctionDefinitions(cpp);

const count = (text, needle) => text.split(needle).length - 1;
const body = (name) => {
  const found = definitions.find((definition) => definition.name === name);
  assert.ok(found, `${name} is missing`);
  return found.body;
};
// The constructor has no return type, so the definition helper skips it.
const constructorBody = (() => {
  const start = cpp.indexOf('ConfigManager::ConfigManager() {');
  assert.ok(start >= 0, 'ConfigManager constructor is missing');
  return cpp.slice(start, cpp.indexOf('\n}\n', start));
})();

assert.ok(h.includes('#include "src/ui/background/background_rules.h"'));
assert.ok(h.includes('char background_photo[background_rules::kMaxPhotoName] = "";'));
assert.ok(h.includes('uint8_t tile_opacity = background_rules::kDefaultTileOpacity;'));
assert.ok(h.includes('uint8_t background_dim = background_rules::kDefaultDim;'));
assert.ok(h.includes('bool saveBackground(const char* photo, uint8_t tile_opacity, uint8_t dim);'));

for (const key of ['bg_photo', 'tile_opacity', 'bg_dim']) {
  assert.ok(key.length <= 15, `${key}: NVS keys hold at most 15 characters`);
  assert.ok(count(cpp, `"${key}"`) >= 3, `${key}: load, save() and saveBackground`);
}

const equal = body('persisted_config_equal');
for (const field of ['background_photo', 'tile_opacity', 'background_dim']) {
  assert.ok(equal.includes(`b.${field}`), `persisted_config_equal compares ${field}`);
}

// background_rules::normalize (host-tested in test-background-rules.mjs) runs
// after load reads the keys and before save() writes them.
assert.match(body('ConfigManager::load'),
  /prefs\.getUChar\("bg_dim"[^;]*;\s*background_rules::normalize\(config\.background_photo, config\.tile_opacity, config\.background_dim\);/,
  'load normalizes what it read');
const saveAll = body('ConfigManager::save');
const normalized = saveAll.search(
  /background_rules::normalize\(normalized\.background_photo,\s*normalized\.tile_opacity,\s*normalized\.background_dim\);/);
assert.ok(normalized >= 0 && normalized < saveAll.indexOf('prefs.putString("bg_photo"'), 'save() normalizes before writing');

for (const [name, site] of [['constructor', constructorBody],
                            ['clear', body('ConfigManager::clear')]]) {
  assert.ok(site.includes("config.background_photo[0] = '\\0';"), `${name} clears the photo`);
  assert.ok(site.includes('config.tile_opacity = background_rules::kDefaultTileOpacity;'),
    `${name} restores the tile opacity`);
  assert.ok(site.includes('config.background_dim = background_rules::kDefaultDim;'),
    `${name} restores the dim`);
}

const save = body('ConfigManager::saveBackground');
assert.ok(save.includes('Device::ScopedStorageWrite storage_write(BatchedNvsWrite::kNeedsDisplayGuard);'));
assert.ok(save.indexOf('return true;') < save.indexOf('ScopedStorageWrite'),
  'unchanged values write nothing');
assert.ok(save.includes('is_safe_name('), 'an unsafe photo name is refused');
assert.ok(save.includes('clamp_opacity(') && save.includes('clamp_dim('), 'values are clamped');
assert.ok(save.indexOf('BatchedNvsWrite::finish(prefs)') < save.indexOf('config.background_dim = dim;'),
  'memory changes only after the commit');

console.log('background settings source contract: PASS');
