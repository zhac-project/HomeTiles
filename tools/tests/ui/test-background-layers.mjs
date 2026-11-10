// Source contract: over a background photo only the three tile layers turn
// transparent, every normal tile card takes the tile opacity in render_tile,
// and the screen and the Settings panel stay solid.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {readRepoFile, repoRoot} from '../../lib/admin-source.mjs';
import {cppFunctionDefinitions} from '../../lib/cpp-source.mjs';

const fn = (file, name) => {
  const found = cppFunctionDefinitions(readRepoFile(...file.split('/'))).find((d) => d.name === name);
  assert.ok(found, `${name} is missing`);
  return found.body;
};

const build = fn('src/ui/ui_manager.cpp', 'UIManager::buildUI');
assert.ok(build.includes('ui_surface_style::apply_backdrop(tab_content_container)'));
assert.ok(!build.includes('lv_obj_set_style_bg_opa(tab_content_container'));
assert.ok(build.includes('lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0)'), 'the screen stays black under the photo');

const grid = fn('src/ui/tabs/tiles/tab_tiles_unified.cpp', 'create_tiles_grid');
assert.ok(grid.includes('apply_backdrop(grid)'));
assert.ok(!grid.includes('lv_obj_set_style_bg_opa(grid'));
const tab = fn('src/ui/tabs/tiles/tab_tiles_unified.cpp', 'build_tiles_tab');
assert.ok(tab.includes('apply_backdrop(parent)'));
assert.ok(!tab.includes('lv_obj_set_style_bg_opa(parent, LV_OPA_COVER'));

const render = fn('src/tiles/runtime/tile_renderer.cpp', 'render_tile');
const border = render.indexOf('apply_global_tile_border(');
const card = render.indexOf('apply_tile_card_background(');
assert.ok(border >= 0 && card > border, 'the card opacity follows the global border');
assert.ok(render.includes('tile.type == TILE_CLOCK && ui_surface_style::photo_backdrop_shown()'));
assert.match(render.slice(border, card), /if \(cardless\) ui_surface_style::disable_tile_border\(tile_obj\);/);

// Only the three layers: overlays (popups, Settings, PIN pad, screensaver)
// keep their own solid backgrounds.
const walk = (dir) => fs.readdirSync(dir, {withFileTypes: true}).flatMap((e) =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const shared = new Set(['ui_surface_style.h', 'ui_surface_style.cpp']);
let calls = 0;
for (const file of walk(path.join(repoRoot, 'src'))) {
  if (!/\.(h|cpp|ino)$/.test(file) || shared.has(path.basename(file))) continue;
  calls += fs.readFileSync(file, 'utf8').split('apply_backdrop(').length - 1;
}
assert.equal(calls, 3, 'apply_backdrop is called for exactly three layers');
assert.ok(fn('src/ui/tabs/settings/tab_settings.cpp', 'build_settings_tab').includes('lv_obj_set_style_bg_opa(tab, LV_OPA_COVER, 0)'),
  'the Settings panel stays solid');

console.log('background layers source contract: PASS');
