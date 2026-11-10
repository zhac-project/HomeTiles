// Issue #83: a Sensor gauge's minimum and maximum keep their decimals (a LiPo
// gauge from 3.7 to 4.2 V became 4 to 4). The stored tile keeps whole numbers
// scaled by 10^decimals, the count in scene_alias[11] beside the other gauge
// options (PackedTileV7 unchanged); a tile stored before has 0 decimals.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileAndRun} from '../../lib/cpp-host.mjs';
import {cppFunctionDefinitions} from '../../lib/cpp-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');

const harness = String.raw`
#include <cstdio>
#include "src/types/sensor/gauge_range.h"
static void range(const char* min_text, const char* max_text) {
  double min = 0, max = 100;
  uint8_t min_dec = 0, max_dec = 0;
  const bool min_ok = sensor_gauge::parse(min_text, min, min_dec);
  const bool max_ok = sensor_gauge::parse(max_text, max, max_dec);
  int32_t lo = 0, hi = 0;
  uint8_t dec = 0;
  sensor_gauge::store(min, max, min_dec > max_dec ? min_dec : max_dec, lo, hi, dec);
  char a[24], b[24];
  sensor_gauge::format(lo, dec, a, sizeof(a));
  sensor_gauge::format(hi, dec, b, sizeof(b));
  std::printf("%d %d %ld %ld %u %s %s %.4f %.4f\n", min_ok, max_ok, static_cast<long>(lo), static_cast<long>(hi),
              static_cast<unsigned>(dec), a, b, sensor_gauge::value(lo, dec), sensor_gauge::value(hi, dec));
}
int main() {
  range("3.7", "4.2");
  range("0", "100");
  range("-12,5", "40");
  range("3.70", "4.200");
  range("0.0005", "1");
  range("1500000", "2500000.5");
  range("abc", "");
  range("-0.25", "0.25");
  return 0;
}
`;
const output = compileAndRun({label: 'Sensor gauge decimals', harness});
if (output !== null) {
  assert.deepEqual(output.trim().split('\n'), [
    '1 1 37 42 1 3.7 4.2 3.7000 4.2000',          // the reporter's LiPo range
    '1 1 0 100 0 0 100 0.0000 100.0000',          // a whole range stays as it was stored before
    '1 1 -125 400 1 -12.5 40 -12.5000 40.0000',   // a decimal comma, one count for both bounds
    '1 1 37 42 1 3.7 4.2 3.7000 4.2000',          // trailing zeros need no decimals
    '1 1 1 1000 3 0.001 1 0.0010 1.0000',          // at most three decimals
    '1 1 15000000 25000005 1 1500000 2500000.5 1500000.0000 2500000.5000',
    '0 0 0 100 0 0 100 0.0000 100.0000',           // unreadable: the defaults 0 and 100 stay
    '1 1 -25 25 2 -0.25 0.25 -0.2500 0.2500',
  ]);
}

// Stored in the Sensor tile's gauge bytes, read back by every unpack with
// gauge options; the defaults clear it.
const config = read('src/tiles/config/tile_config.cpp');
assert.match(config, /out\.scene_alias\[10\] = static_cast<char>\(\(graph_h >> 8\) & 0xFF\);\s*\/\/ The decimals of the gauge's bounds \(issue #83\); 0 in older tiles\.\s*out\.scene_alias\[11\] = static_cast<char>\(\s*in\.sensor_gauge_decimals <= sensor_gauge::kMaxDecimals \? in\.sensor_gauge_decimals : 0\);/);
assert.equal(config.match(/out\.sensor_gauge_decimals = gauge_decimals <= sensor_gauge::kMaxDecimals \? gauge_decimals : 0;/g).length, 2, 'V7 and V6');
assert.equal(config.match(/out\.sensor_gauge_decimals = 0;\s*out\.sensor_gauge_arc = 100;/g).length, 7, 'every unpack clears it');
const header = read('src/tiles/config/tile_config.h');
assert.match(header, /a\.sensor_gauge_decimals == b\.sensor_gauge_decimals &&/, 'part of the no-op check');

// The request keeps the typed decimals, the JSON gives them back, the input
// takes them, the gauge maps floats.
const handler = read('src/types/sensor/web_handler.cpp');
assert.match(handler, /sensor_gauge::store\(gauge_min, gauge_max, min_decimals > max_decimals \? min_decimals : max_decimals,\s*tile\.sensor_gauge_min, tile\.sensor_gauge_max, tile\.sensor_gauge_decimals\);/);
assert.doesNotMatch(handler, /sensor_gauge_m(in|ax) = raw\.toInt\(\)/);
const json = read('src/web/server/handlers/web_admin_tiles.cpp');
assert.match(json, /if \(tile\.type == TILE_SENSOR\) \{[\s\S]{0,200}sensor_gauge::format\(tile\.sensor_gauge_min, tile\.sensor_gauge_decimals, bound, sizeof\(bound\)\);/);
assert.equal(read('src/types/sensor/web_html.cpp').match(/_sensor_gauge_m(?:in|ax)" step="any"/g).length, 2);
const renderer = cppFunctionDefinitions(read('src/types/sensor/renderer.cpp')).find(f => f.name === 'render_sensor_tile').source;
assert.match(renderer, /float gauge_min = sensor_gauge::value\(tile\.sensor_gauge_min, tile\.sensor_gauge_decimals\);/);
assert.match(read('src/types/sensor/widgets.h'), /float gauge_min = 0;\s*float gauge_max = 100;/);
assert.match(read('src/tiles/runtime/tile_renderer.cpp'), /static int32_t map_gauge_arc_value\(float numeric, float min_value, float max_value\)/);
console.log('Sensor gauge: decimal minimum and maximum');
