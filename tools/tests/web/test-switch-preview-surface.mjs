// The Switch preview colors its icon, circle and knob on the tile's own
// surface, also when its state arrives after the editor's surface scope has
// ended (updateSwitchValuePreview waits for the entity meta). User
// 2026-10-11: a filled Relay tile showed the light theme's icon and knob
// after a click in the Web Admin.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { extractDeliveredFunction } from '../../lib/admin-source.mjs';

const context = { seen: [] };
vm.createContext(context);
vm.runInContext(['withSurface', 'surfaceTheme', 'applySwitchPreviewState'].map(extractDeliveredFunction).join('\n') + `
function applySwitchPreviewColors() { seen.push(globalThis.hometilesPreviewSurface); }
function applyIconDiscTint() { seen.push(globalThis.hometilesPreviewSurface); }
function applySwitchPreviewBar() { seen.push(globalThis.hometilesPreviewSurface); }
`, context);

const run = surface => JSON.parse(vm.runInContext(`(() => {
  seen.length = 0;
  delete globalThis.hometilesPreviewSurface;
  applySwitchPreviewState({dataset: ${JSON.stringify(surface === null ? {} : {surface})}}, {}, 'switch.relay');
  return JSON.stringify({seen, after: globalThis.hometilesPreviewSurface ?? null});
})()`, context));

// 2 = a filled tile (ui_theme::kDarkTinted), 1 light, 0 dark.
for (const [surface, mode] of [['jewel', 2], ['light', 1], ['dark', 0]]) {
  const result = run(surface);
  assert.deepEqual(result.seen, [mode, mode, mode], `${surface}: icon, circle and knob on the tile's surface`);
  assert.equal(result.after, null, `${surface}: the scope ends with the state`);
}
// A tile without its own surface keeps the page's theme.
assert.deepEqual(run(null).seen, [null, null, null]);

console.log('Switch preview: icon, circle and knob on the tile\'s own surface');
