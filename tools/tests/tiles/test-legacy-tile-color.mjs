// ZHAC fork: v0.7 panels kept an own background color on any tile; v0.9 takes
// a tile's color from its icon and ignored the old one. Loading a grid turns
// that color into the tile's fixed icon color with Fill, once. Tiles whose
// icon follows their own state (a Light on/off) only take Fill: a fixed icon
// color would hide that state (owner 2026-11-10, JC4880).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const between = (text, start, end) => {
  const from = text.indexOf(start);
  assert.ok(from >= 0, `missing ${start}`);
  const to = text.indexOf(end, from + start.length);
  assert.ok(to > from, `missing ${end} after ${start}`);
  return text.slice(from, to);
};

const header = read('src/tiles/config/tile_config.h');
const migrate = between(header, 'static inline bool migrateLegacyTileColor(Tile& tile) {', '\n}\n');
// Only tiles with an icon color record, never the own-color tiles, never a
// tile that already has a record, never the default grey or an unset color.
for (const guard of ['!tileTypeHasIconColors(tile.type)', 'tileTypeKeepsOwnColor(tile.type)',
  'tile.icon_colors.length()', '!tileBgColorIsSet(tile)', 'tileBgColorFollowsDefault(tile.bg_color)']) {
  assert.ok(migrate.includes(guard), `migration guard: ${guard}`);
}
assert.match(migrate, /legacyTileColorStaysFixed\(tile\.type\)/);
assert.match(migrate, /tile\.icon_colors = normalizeTileIconColors\(tile\.type, record\);/);
// The old color is cleared, so the step runs once and a later save keeps the
// user's own choice.
assert.match(migrate, /tile\.bg_color = 0;/);
const format = migrate.match(/snprintf\(record, sizeof\(record\), ("[^"]+")/);
assert.ok(format, 'record format');
const staysFixed = between(header, 'static constexpr bool legacyTileColorStaysFixed(int type) {', '\n}\n') + '\n}\n';

// loadGrid runs it after the sidecars (the icon color record) and stores the
// grid through the existing save-on-change step.
const cpp = read('src/tiles/config/tile_config.cpp');
const load = between(cpp, 'applyIconColorsFromSd(folder_id, grid);', 'bool TileConfig::saveGrid(');
const call = load.indexOf('if (migrateLegacyTileColor(grid.tiles[i])) changed = true;');
assert.ok(call > 0, 'loadGrid migrates each tile');
assert.ok(call < load.indexOf('if (needs_migration_save || changed) {'), 'before the save-on-change step');

// The record survives normalization on every migrated type: Fill at the Web
// Admin's strength, the old color as fixed icon color only where the icon
// has no state color of its own.
const out = path.join(root, 'build/tests/legacy-tile-color');
fs.mkdirSync(out, {recursive: true});
const source = path.join(out, 'test.cpp');
const binary = path.join(out, process.platform === 'win32' ? 'test.exe' : 'test');
fs.writeFileSync(source, `#include <cstdio>
#include "src/types/tile_type_policy.h"
#include "src/tiles/config/tile_icon_colors.h"
${staysFixed}
int main() {
  int fixed_types = 0, state_types = 0;
  for (int type = 0; type < 64; ++type) {
    if (!tileTypeHasIconColors(type) || type == TILE_CLOCK || type == TILE_TEXT || type == TILE_PIXELANIM) continue;
    const bool stays = legacyTileColorStaysFixed(type);
    char color[8] = "";
    if (stays) std::snprintf(color, sizeof(color), "%06lX", 0x3A7BD5ul);
    char record[24];
    std::snprintf(record, sizeof(record), ${format[1]}, color, static_cast<unsigned>(tile_icon_colors::kTintDefault));
    char normalized[tile_icon_colors::kMaxRecordBytes + 1];
    if (!tile_icon_colors::normalize(record, normalized, sizeof(normalized), tileTypeIconColorsByValue(type),
                                     tileTypeIconColorsByState(type), true, tileTypeRulesUseOwnEntity(type),
                                     type == TILE_MEDIA)) {
      std::printf("type %d: record dropped\\n", type);
      return 1;
    }
    uint32_t rgb = 0;
    const bool has_fixed = tile_icon_colors::fixed_color(normalized, rgb);
    if (stays ? (!has_fixed || rgb != 0x3A7BD5u) : has_fixed) {
      std::printf("type %d: fixed color %s\\n", type, stays ? "lost" : "hides the state");
      return 1;
    }
    if (tile_icon_colors::fill_of(normalized) != tile_icon_colors::kTintDefault || !tile_icon_colors::fills(normalized)) {
      std::printf("type %d: fill lost\\n", type);
      return 1;
    }
    ++(stays ? fixed_types : state_types);
  }
  // A Light/Switch and a Binary sensor show their on/off color; Folder and
  // Sensor keep the old color.
  if (legacyTileColorStaysFixed(TILE_SWITCH) || legacyTileColorStaysFixed(TILE_BINARY_SENSOR) ||
      legacyTileColorStaysFixed(TILE_COVER) || legacyTileColorStaysFixed(TILE_CLIMATE) ||
      !legacyTileColorStaysFixed(TILE_FOLDER) || !legacyTileColorStaysFixed(TILE_SENSOR)) {
    std::printf("wrong split\\n");
    return 1;
  }
  std::printf("%d fixed, %d by state\\n", fixed_types, state_types);
  return fixed_types > 4 && state_types > 4 ? 0 : 1;
}
`);
const cxx = ['clang++', 'g++'].find(c => spawnSync(c, ['--version']).status === 0);
if (!cxx) {
  console.log('SKIP: legacy tile color record needs a host C++ compiler (source checks passed)');
  process.exit(0);
}
let result = spawnSync(cxx, ['-std=c++17', '-I', root, source, '-o', binary], {encoding: 'utf8'});
assert.equal(result.status, 0, result.stdout + result.stderr);
result = spawnSync(binary, [], {encoding: 'utf8'});
assert.equal(result.status, 0, result.stdout + result.stderr);
console.log(`ok - legacy tile colors become Fill, fixed where no state color (${result.stdout.trim()})`);
