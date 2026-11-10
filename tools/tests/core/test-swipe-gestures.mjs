// The gesture menu (user 2026-10-11): each edge opens at most one action
// (Settings, Home, Back, the screensaver), each action has at most one edge.
// New panels: Settings from the top, Home from the bottom, Back and the
// screensaver off. Settings keeps its edge in the access record, a hidden
// Settings tile always keeps its swipe. The rule (swipe_gestures.h) runs
// natively; the panel, the Web Admin endpoint and the menu's swap use it.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {compileAndRun} from '../../lib/cpp-host.mjs';
import {extractDeliveredFunction, readRepoFile} from '../../lib/admin-source.mjs';

const read = file => readRepoFile(file).replace(/\r\n?/g, '\n');

// --- The rule, natively ---------------------------------------------------------------------------
const output = compileAndRun({
  label: 'Swipe gestures',
  harness: String.raw`
#include <cstdio>
#include <cstdint>
#include "src/core/config/swipe_gestures.h"
using namespace swipe_gestures;
struct Config {
  bool settings_swipe_enabled = true;
  uint8_t settings_reveal_edge = kDefaultSettingsEdge;
  bool settings_tile_hidden = false;
  uint8_t home_swipe_edge = kDefaultHomeEdge;
  uint8_t back_swipe_edge = kEdgeOff;
  uint8_t screensaver_swipe_edge = kEdgeOff;
};
static void show(const char* name, const Config& c) {
  uint8_t a[kEdgeCount];
  actions(c, a);
  std::printf("%s=%u%u%u%u s%u%u\n", name, a[0], a[1], a[2], a[3], c.settings_swipe_enabled ? 1 : 0,
              static_cast<unsigned>(c.settings_reveal_edge));
}
int main() {
  Config fresh;
  show("fresh", fresh);
  // The menu's swap: Home on top, Settings on the bottom.
  Config swapped;
  const uint8_t swap[] = {kOff, kOff, kHome, kSettings};
  apply(swapped, swap);
  show("swapped", swapped);
  // Settings off while its tile shows: no Settings swipe.
  Config off;
  const uint8_t none[] = {kBack, kScreensaver, kOff, kHome};
  apply(off, none);
  show("off", off);
  // Settings off while its tile is hidden: it keeps its edge, that edge's
  // other action turns off.
  Config hidden;
  hidden.settings_tile_hidden = true;
  const uint8_t steal[] = {kOff, kOff, kScreensaver, kHome};
  apply(hidden, steal);
  show("hidden", hidden);
  // An action chosen twice keeps its first edge.
  Config twice;
  const uint8_t doubled[] = {kHome, kHome, kSettings, kOff};
  apply(twice, doubled);
  show("twice", twice);
  // Loading: Settings keeps a shared edge, the other action turns off; bad
  // values are no edge.
  Config shared;
  shared.settings_reveal_edge = 3;
  shared.home_swipe_edge = 3;
  shared.back_swipe_edge = 9;
  shared.screensaver_swipe_edge = 0;
  normalize(shared);
  show("shared", shared);
  std::printf("edges=%u%u%u\n", shared.home_swipe_edge, shared.back_swipe_edge, shared.screensaver_swipe_edge);
  // A hidden tile turns the Settings swipe on when loading.
  Config forced;
  forced.settings_swipe_enabled = false;
  forced.settings_tile_hidden = true;
  forced.home_swipe_edge = 2;
  normalize(forced);
  show("forced", forced);
  return 0;
}
`});
if (output !== null) {
  const value = name => output.split('\n').find(line => line.startsWith(name + '=')).slice(name.length + 1).trim();
  // Actions per edge: left, right, top, bottom (0 off, 1 Settings, 2 Home, 3 Back, 4 screensaver).
  assert.equal(value('fresh'), '0012 s12', 'Settings from the top, Home from the bottom');
  assert.equal(value('swapped'), '0021 s13', 'the swap moves Settings to the bottom');
  assert.equal(value('off'), '3402 s02', 'Settings off without its tile hidden');
  assert.equal(value('hidden'), '0012 s12', 'a hidden tile keeps Settings on its edge');
  assert.equal(value('twice'), '2010 s12', 'an action chosen twice keeps its first edge');
  assert.equal(value('shared'), '4001 s13', 'Settings keeps a shared edge');
  assert.equal(value('edges'), '440', 'Home and Back lose their edges, the screensaver keeps the left one');
  assert.equal(value('forced'), '0010 s12', 'a hidden tile turns the Settings swipe on; Home gives way');
}

// --- The panel ------------------------------------------------------------------------------------
const config = read('src/core/config/config_manager.cpp');
for (const marker of [
  'config.home_swipe_edge = prefs.getUChar("sw_home", swipe_gestures::kDefaultHomeEdge);',
  'config.back_swipe_edge = prefs.getUChar("sw_back", swipe_gestures::kEdgeOff);',
  'config.screensaver_swipe_edge = prefs.getUChar("sw_saver", swipe_gestures::kEdgeOff);',
  'prefs.putUChar("sw_home", normalized.home_swipe_edge);',
  'prefs.putUChar("sw_back", normalized.back_swipe_edge);',
  'prefs.putUChar("sw_saver", normalized.screensaver_swipe_edge);',
  'swipe_gestures::normalize(normalized);',
  'a.screensaver_swipe_edge == b.screensaver_swipe_edge &&',
]) assert.ok(config.includes(marker), `config: ${marker}`);
assert.equal((config.match(/config\.settings_reveal_edge = swipe_gestures::kDefaultSettingsEdge;/g) || []).length, 2,
  'new panels and a reset start with Settings from the top');
assert.ok(config.includes('config.settings_swipe_enabled = stored_access ? config.settings_tile_hidden : true;'),
  'a panel without stored access starts with the Settings swipe');
const ui = read('src/ui/ui_manager.cpp');
const run = ui.slice(ui.indexOf('void UIManager::runSwipeAction(uint8_t action) {'), ui.indexOf('\nvoid UIManager::settings_gesture_pressed_object_event_cb'));
for (const marker of [
  'case swipe_gestures::kSettings:\n      requestSettingsAccess();',
  'case swipe_gestures::kHome:\n      if (folder != root) switchToFolder(root);',
  'case swipe_gestures::kBack:\n      if (folder != root) switchToFolder(tileConfig.getFolderParent(folder));',
  'case swipe_gestures::kScreensaver:\n      show_image_screensaver();',
]) assert.ok(run.includes(marker), `runSwipeAction: ${marker}`);
assert.ok(ui.includes('if (actions[candidate] != swipe_gestures::kOff && distance[candidate] < nearest) {'),
  'a press arms the nearest edge with an action');
assert.ok(ui.includes('actions[access_gesture_edge] != access_gesture_action'), 'a changed menu ends an armed swipe');

// In Settings (user 2026-10-11: "why can't I swipe from Settings to Home"):
// Home leaves Settings for Home, Back closes it like its X; a Settings edge
// does nothing there, and an open list, dialog, entry or the setup blocks
// every swipe.
const settingsRun = run.slice(run.indexOf('if (active_tab_index == kSettingsTab'), run.indexOf('switch (action) {'));
for (const marker of [
  'if (active_tab_index == kSettingsTab && (action == swipe_gestures::kHome || action == swipe_gestures::kBack)) {',
  'settings_screen::close_overlays();',
  'if (action == swipe_gestures::kHome) switchToFolder(root);\n    else switchToTab(0);',
  'return;',
]) assert.ok(settingsRun.includes(marker), `runSwipeAction in Settings: ${marker}`);
assert.ok(read('src/ui/tabs/settings/tab_settings.cpp').includes('void close_settings() { uiManager.switchToTab(0); }'),
  'Back closes Settings exactly like its X');
const press = ui.slice(ui.indexOf('void UIManager::settings_gesture_indev_event_cb'), ui.indexOf('void UIManager::nav_button_event_cb'));
for (const marker of [
  'if (tab != 0 && (tab != kSettingsTab || settings_screen::overlay_open())) return;',
  'if (object == self->tab_panels[tab]) {',
  'if (action == swipe_gestures::kSettings) action = swipe_gestures::kOff;',
  'self->access_gesture_tab = tab;',
]) assert.ok(press.includes(marker), `Settings swipes: ${marker}`);
assert.ok(ui.includes('if (active_tab_index != access_gesture_tab ||'), 'a swipe ends on the tab it started on');
assert.ok(ui.includes('static constexpr uint8_t kSettingsTab = 3;') && ui.includes('build_settings_tab(tab_panels[3], hotspot_cb);'));
const settingsScreen = read('src/ui/tabs/settings/settings_screen.cpp');
assert.match(settingsScreen, /bool overlay_open\(\) \{\n  return settings_parts::options_open\(\) \|\| g_dialog != Dialog::None \|\| settings_entry::is_open\(\) \|\|\n\s*settings_model::setup_step\(\) >= 0;\n\}/);
assert.ok(read('src/ui/tabs/settings/settings_parts.cpp').includes('bool options_open() { return g_options.overlay != nullptr; }'));

// --- Web Admin: endpoint, menu, Settings tile ---------------------------------------------------------
const routes = read('src/web/server/web_admin.cpp');
assert.ok(routes.includes('server.on("/api/display/gestures", HTTP_GET,') &&
  routes.includes('server.on("/api/display/gestures", HTTP_POST,'));
const handlers = read('src/web/server/handlers/web_admin_handlers.cpp');
const handler = handlers.slice(handlers.indexOf('void WebAdminServer::handleGestures() {'));
assert.match(handler, /swipe_gestures::apply\(cfg, wanted\);\s*if \(!configManager\.save\(cfg\)\) \{/);
assert.ok(handler.includes('uiManager.refreshSettingsGestureZone();'));
const settingsTile = read('src/types/settings/web_html.cpp');
assert.doesNotMatch(settingsTile, /tr\.settings_reveal_edge|tr\.settings_swipe_enable|tr\.settings_swipe_note/,
  'the Settings tile has no swipe fields of its own');

// The menu: a second use of an action swaps the two edges.
const posts = [];
const selects = [2, 3, 0, 1].map(edge => {
  const action = String([0, 0, 1, 2][edge]);
  return {dataset: {edge: String(edge), action}, value: action};
});
const panel = {querySelectorAll: () => selects};
let noted = null;
const context = vm.createContext({
  URLSearchParams, Number, String, Array, JSON,
  document: {querySelectorAll: () => selects},
  fetch: async (url, options) => {
    posts.push({url, body: String(options?.body || '')});
    const params = new URLSearchParams(options.body);
    const actions = ['left', 'right', 'top', 'bottom'].map(name => Number(params.get(name)));
    return {ok: true, json: async () => ({success: true, actions, settings_edge: actions.indexOf(1)})};
  },
  noteSettingsSwipeSaved: (enabled, edge) => { noted = [enabled, edge]; },
  showNotification: () => {}, t: key => key,
});
const display = read('src/web/admin/settings/display-borders.js');
vm.runInContext('let gestureActions = null;\n' + ['readGestureActions', 'showGestureActions', 'scopeGestureSelects', 'saveGestureEdge']
  .map(name => extractDeliveredFunction(name)).join('\n'), context);
const top = selects.find(select => select.dataset.edge === '2');
top.value = '2';  // Home chosen at the top, where Settings is.
top.closest = () => panel;
await context.saveGestureEdge(top);
assert.equal(posts.length, 1);
assert.equal(posts[0].url, '/api/display/gestures');
assert.equal(posts[0].body, 'left=0&right=0&top=2&bottom=1', 'Settings takes the bottom edge Home left');
assert.deepEqual(noted, [true, 3]);
assert.deepEqual(selects.map(select => select.value), ['2', '1', '0', '0'], 'every menu shows the swap');
assert.deepEqual(selects.map(select => select.dataset.action), ['2', '1', '0', '0'], 'and keeps it as the stored state');
assert.ok(read('src/web/server/render/web_admin_html.cpp')
  .includes('"\\" data-action=\\"" + String(actions[edge]) + "\\" onchange=\\"saveGestureEdge(this)\\">";'),
  'the server marks the stored action of each select');
assert.ok(display.includes('if (gestureActions) showGestureActions(gestureActions, tabEl);'),
  'lazily inserted folders show the same menu');

// Translations of the new heading.
const i18n = read('src/core/i18n/i18n.cpp');
for (const text of ['"Wischen vom Rand"', '"Edge swipes"', '"Balayages depuis le bord"', '"Przesunięcia od krawędzi"']) {
  assert.ok(i18n.includes(text), text);
}
console.log('Swipe gestures: one action per edge, Settings safe, panel, endpoint and menu swap pass');
