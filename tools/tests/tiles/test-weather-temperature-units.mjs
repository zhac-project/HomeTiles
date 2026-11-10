// A Weather tile's chosen temperature sensor shows in the weather entity's
// unit (user 2026-10-12: a °F sensor beside a °C weather entity showed its °F
// number with "°C"). The panel (temperature_units.h) and the Web Admin
// preview (types/weather/admin.js) read the same units and convert alike; a
// sensor without a known unit is taken as it is.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {compileAndRun} from '../../lib/cpp-host.mjs';
import {extractDeliveredFunction} from '../../lib/admin-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');

// [sensor value, sensor unit, weather unit, shown value]
const cases = [
  [20, '°C', '°C', 20],
  [68, '°F', '°C', 20],
  [20, '°C', '°F', 68],
  [293.15, 'K', '°C', 20],
  [20, '℃', '℉', 68],
  [20, 'C', 'F', 68],
  [20, '', '°F', 20],        // the sensor's unit unknown: as it is
  [20, '°C', '', 20],        // the weather's unit unknown: as it is
  [20, '%', '°C', 20],       // no temperature unit: as it is
  [-40, '°F', '°C', -40],
];
const units = ['°C', '°F', 'K', '℃', '℉', 'C', 'c', 'F', ' °C ', '', '%', 'kWh', 'k'];

const harness = String.raw`
#include <cstdio>
#include "src/types/weather/temperature_units.h"
int main() {
  const char* units[] = {${units.map(u => JSON.stringify(u)).join(', ')}};
  for (const char* unit : units) std::printf("%c", temperature_units::of(unit) ? temperature_units::of(unit) : '-');
  std::printf("\n");
  struct Case { float value; const char* from; const char* to; };
  const Case cases[] = {${cases.map(([v, f, t]) => `{static_cast<float>(${v}), ${JSON.stringify(f)}, ${JSON.stringify(t)}}`).join(', ')}};
  for (const Case& c : cases) {
    std::printf("%.2f\n", temperature_units::convert(c.value, temperature_units::of(c.from), temperature_units::of(c.to)));
  }
  return 0;
}
`;
const output = compileAndRun({label: 'Weather temperature units', harness});
if (output !== null) {
  const lines = output.trim().split('\n');
  assert.equal(lines[0], 'CFKCFCCFC----', 'the units the panel reads');
  cases.forEach(([value, from, to, shown], i) => assert.equal(Number(lines[i + 1]), shown, `${value} ${from} -> ${to}`));
}

// The Web Admin preview: the same units, the same results, and the sensor's
// unit from the entity metadata.
const ctx = vm.createContext({});
vm.runInContext(['temperatureUnitOf', 'convertTemperature'].map(extractDeliveredFunction).join('\n'), ctx);
assert.equal(units.map(u => vm.runInContext(`temperatureUnitOf(${JSON.stringify(u)})`, ctx) || '-').join(''), 'CFKCFCCFC----');
for (const [value, from, to, shown] of cases) {
  const got = vm.runInContext(`convertTemperature(${value}, temperatureUnitOf(${JSON.stringify(from)}), temperatureUnitOf(${JSON.stringify(to)}))`, ctx);
  assert.ok(Math.abs(got - shown) < 0.01, `preview ${value} ${from} -> ${to}: ${got}`);
}
const admin = read('src/types/weather/admin.js');
assert.match(admin, /state\.temperature = convertTemperature\(weatherPreviewNumber\(values\?\.\[temperatureEntity\] \?\? ''\),\s*temperatureUnitOf\(units\?\.\[temperatureEntity\]\), temperatureUnitOf\(state\.unit\)\);/);
assert.match(read('src/web/admin/tiles/grid-preview.js'), /tile\.weather_humidity_sensor \|\| '', metaValues, metaUnits\)/);
assert.match(read('src/web/admin/tiles/live-preview.js'), /sensorMetaCache\.values, sensorMetaCache\.units\), \{/);

// The panel converts after it read the weather entity's unit, the sensor's
// unit from the Bridge's metadata.
const sensors = read('src/types/weather/weather_sensors.h');
assert.match(sensors, /temperature = temperature_units::convert\(numeric, temperature_units::of\(haBridgeConfig\.findSensorUnit\(sensor\)\.c_str\(\)\),\s*temperature_units::of\(weather_unit\.c_str\(\)\)\);/);
const renderer = read('src/tiles/runtime/tile_renderer.cpp');
assert.match(renderer, /decode_basic_json_escapes\(unit\);\s*weather_sensors::apply_temperature\(tile\.weather_temperature_sensor, unit, temperature, has_temp\);/);
const popup = read('src/ui/popups/weather/weather_popup.cpp');
assert.match(popup, /else unit = ctx->unit;\s*\/\/ The sensor in the weather entity's unit \(weather_sensors\.h\)\.\s*weather_sensors::apply_temperature\(ctx->temperature_sensor, unit, temperature, has_temp\);/);
console.log('Weather temperature sensor: shown in the weather entity\'s unit');
