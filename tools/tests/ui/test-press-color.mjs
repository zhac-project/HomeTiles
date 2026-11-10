// One press color for every card (user 2026-10-11, chosen in
// build/design-mockups/tile-colors): a dark card 0x10 lighter as always, a
// light card two of the light theme's steps darker (a white tile showed no
// press, a pressed Settings card turned the screen's grey). The light theme's
// chosen segment is its secondary text grey with white words.
import assert from 'node:assert/strict';

import {readRepoFile} from '../../lib/admin-source.mjs';
import {compileAndRun} from '../../lib/cpp-host.mjs';

const read = file => readRepoFile(file).replace(/\r\n?/g, '\n');

const harness = String.raw`
#include "src/ui/shared/tone_color.h"
#include <cstdio>
#include <initializer_list>

int main() {
  for (unsigned card : {0xFFFFFFu, 0x1A1A1Au, 0xC07431u, 0x7D7D7Du, 0xFFE082u}) {
    std::printf("%06X %06X\n", card, static_cast<unsigned>(tone_color::pressed_card(card)));
  }
  std::printf("screen %06X\n", static_cast<unsigned>(ui_theme::kLight.screen));
  return 0;
}
`;

const output = compileAndRun({label: 'Press color', harness});
if (output !== null) {
  const lines = output.trim().split('\n').map(line => line.trim().split(' '));
  const pressed = Object.fromEntries(lines.filter(l => l[0] !== 'screen').map(([card, out]) => [card, out]));
  const screen = parseInt(lines.find(l => l[0] === 'screen')[1], 16);
  const grey = hex => (parseInt(hex, 16) >> 8) & 0xFF;
  // White gets darker, clearly below the light screen (one step matched it).
  assert.ok(grey(pressed.FFFFFF) < ((screen >> 8) & 0xFF) - 8, `white pressed ${pressed.FFFFFF} below the screen`);
  // A light own color (a yellow clock) gets darker too.
  assert.ok(parseInt(pressed.FFE082, 16) < 0xFFE082, 'a light card gets darker');
  // Dark cards: 0x10 lighter per channel as before (dark theme, filled tiles, the idle grey).
  assert.equal(pressed['1A1A1A'], '2A2A2A');
  assert.equal(pressed.C07431, 'D08441');
  assert.equal(pressed['7D7D7D'], '8D8D8D');
}

// Every tile renderer and the Settings cards use it; no copy of the old loop.
for (const file of ['src/types/binary_sensor/renderer.cpp', 'src/types/camera/renderer.cpp', 'src/types/climate/renderer.cpp',
  'src/types/clock/renderer.cpp', 'src/types/cover/renderer.cpp', 'src/types/device/device_tile.cpp',
  'src/types/energy/renderer.cpp', 'src/types/media/renderer.cpp', 'src/types/navigate/renderer.cpp',
  'src/types/scene/renderer.cpp', 'src/types/sensor/renderer.cpp', 'src/types/switch/renderer.cpp',
  'src/types/text/renderer.cpp', 'src/types/weather/renderer.cpp']) {
  const source = read(file);
  assert.ok(source.includes('tone_color::pressed_card('), `${file} presses by the one rule`);
  assert.ok(!/brighten_rgb_color\([^)]*0x10\)/.test(source), `${file} has no own press color`);
}
const iconSource = read('src/tiles/runtime/tile_icon_source.cpp');
assert.ok(iconSource.includes('const uint32_t pressed = tone_color::pressed_card(rgb);'), 'apply_card_background');
assert.ok(!iconSource.includes('+ 0x10'), 'no copied loop in tile_icon_source');
const settings = read('src/ui/tabs/settings/settings_screen.cpp');
assert.ok(settings.includes('const uint32_t pressed = tone_color::pressed_card(tile);') &&
  settings.includes(': tone_color::pressed_card(card);'), 'Settings categories');
assert.ok(!settings.includes('+ 0x10'), 'no copied loop in Settings');

// The chosen segment of the light theme.
const parts = read('src/ui/tabs/settings/settings_parts.cpp');
assert.match(parts, /lv_color_hex\(light \? ui_theme::kLight\.text_secondary : kSelectedBg\)/);
assert.match(parts, /const uint32_t ink = light \? 0xFFFFFFu : kSelectedText;/);
assert.equal(read('src/ui/shared/ui_theme.h').match(/kLight = \{([^}]*)\}/)[1].split(',')[8].trim(), '0x5F6368',
  'the light secondary text grey');

console.log('Press color: one rule for every card, the light segment in the secondary grey');
