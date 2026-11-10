// The head bar's options in its own settings tab (user 2026-10-13, mockup
// build/design-mockups/pages/kopf-tab.png; before in the Global tab): the
// gear (the very setting of the Settings tile's "Zahnrad oben im Kopf", kept
// in step), the time and the pages' overview on a tap on the head's dots;
// without the overview the dots only show the page (no press, no overview).
// Only with a head bar layout. Stored at once, the heads built again; runs
// the delivered saveHeadSwitch. Home's title and icon there:
// test-home-head-title.
import assert from 'node:assert/strict';
import {extractDeliveredFunction, inlineScriptSafe, readRepoFile} from '../../lib/admin-source.mjs';
import {runDomHarness} from '../../lib/headless-dom.mjs';

const config = readRepoFile('src/core/config/config_manager.cpp');
const configH = readRepoFile('src/core/config/config_manager.h');
assert.match(configH, /bool head_clock = true;\s*bool head_overview = true;/, 'Both on by default (as before)');
assert.match(config, /config\.head_clock = prefs\.getBool\("head_clock", true\);\s*config\.head_overview = prefs\.getBool\("head_overview", true\);/);
assert.match(config, /prefs\.putBool\("head_clock", normalized\.head_clock\);\s*prefs\.putBool\("head_overview", normalized\.head_overview\);/);
assert.equal(config.match(/config\.head_clock = true;\s*config\.head_overview = true;/g)?.length, 2, 'Both defaults (new panel, reset)');
assert.match(config, /a\.head_clock == b\.head_clock &&\s*a\.head_overview == b\.head_overview &&/);
assert.match(config, /bool ConfigManager::saveHeadClock\(bool enabled\) \{ return saveHeadSwitch\(config\.head_clock, "head_clock", enabled\); \}/);
assert.match(config, /return saveHeadSwitch\(config\.head_overview, "head_overview", enabled\);/);

const server = readRepoFile('src/web/server/web_admin.cpp');
const handlers = readRepoFile('src/web/server/handlers/web_admin_handlers.cpp');
assert.match(server, /server\.on\("\/api\/display\/head", HTTP_POST,\s*guarded\(withStorageHold\(\[this\]\(\) \{ this->handleSaveHeadSwitch\(\); \}\)\)\);/);
const handler = handlers.slice(handlers.indexOf('void WebAdminServer::handleSaveHeadSwitch()'), handlers.indexOf('void WebAdminServer::handleSaveTheme()'));
assert.match(handler, /if \(part == "clock"\) \{\s*saved = configManager\.saveHeadClock\(enabled\);\s*\} else if \(part == "overview"\) \{\s*saved = configManager\.saveHeadOverview\(enabled\);\s*\} else \{\s*sendJsonError\(server, 400/);
assert.match(handler, /tiles_rebuild_heads\(!powerManager\.isInSleep\(\)\);/, 'Only the heads, at once');
assert.doesNotMatch(handler, /tiles_request_reload_all|tiles_invalidate_folder/, 'No grid built again (user 2026-10-14: it took a while)');

// The panel: the time hidden, the dots without a press or the overview.
const bar = readRepoFile('src/ui/tabs/tiles/home_bar.cpp');
assert.match(bar, /remember_time_label\(time_label\);[\s\S]{0,200}if \(!config\.head_clock\) lv_obj_add_flag\(time_label, LV_OBJ_FLAG_HIDDEN\);/);
const dots = bar.slice(bar.indexOf('lv_obj_set_user_data(dots, &g_dots_marker);'), bar.indexOf('// The title ends a gap before them.'));
assert.match(dots, /if \(config\.head_overview\) \{\s*[\s\S]*lv_obj_add_flag\(dots, LV_OBJ_FLAG_CLICKABLE\);[\s\S]*lv_obj_add_event_cb\(dots, dots_event, LV_EVENT_PRESSED, nullptr\);[\s\S]*lv_obj_add_event_cb\(dots, dots_event, LV_EVENT_PRESS_LOST, nullptr\);[\s\S]*\}\s*$/,
  'Without the overview the dots take no touch');
assert.equal(dots.match(/lv_obj_add_event_cb\(dots, dots_event/g)?.length, 4);

// The head bar tab: only with a head bar, the gear by the Settings tile's
// class, every option saved at once; the Global tab has them no more.
const html = readRepoFile('src/web/server/render/web_admin_html.cpp').replace(/\r\n?/g, '\n');
const head = html.slice(html.indexOf('  String head_panel;'), html.indexOf('    head_panel += "</div></section>\\n";'));
assert.ok(head.length > 0 && /^  String head_panel;\n  if \(!screensaver_mode && grid_layout::head_bar\(\)\) \{/.test(head), 'The head bar tab only with a head bar');
const global = html.slice(html.indexOf('  String global_panel;'), html.indexOf('  String head_panel;'));
assert.ok(global.length > 0 && !global.includes('head_toggle') && !global.includes('head_bar_heading'), 'The Global tab has no head bar options');
assert.match(html, /appendHtmlEscaped\(html, tr\.panel_tab_tile\);\s*if \(head_panel\.length\(\)\) \{\s*html \+= "<\/button><button type=\\"button\\" data-pane=\\"head\\" onclick=\\"showSettingsPane\('" \+ tab_id \+ "','head'\)\\">";\s*appendHtmlEscaped\(html, tr\.head_bar_heading\);/,
  'Its tab between Tile and Global');
assert.match(html, /if \(head_panel\.length\(\)\) \{\s*html \+= "<div class=\\"panel-head\\">";\s*html \+= head_panel;/);
assert.match(head, /head_toggle\("settings-head-gear", "saveHeadGear\(this\.checked\)", display\.head_gear, tr\.head_bar_gear\);/);
assert.match(head, /head_toggle\("head-bar-clock", "saveHeadSwitch\('clock', this\.checked\)", display\.head_clock, tr\.head_bar_clock\);/);
assert.match(head, /head_toggle\("head-bar-overview", "saveHeadSwitch\('overview', this\.checked\)", display\.head_overview,\s*tr\.head_bar_overview\);/);
assert.match(readRepoFile('src/types/settings/web_html.cpp'), /class=\\"settings-head-gear\\" id=\\"" \+\s*prefix \+ "settings_head_gear\\" onchange=\\"saveHeadGear\(this\.checked\)\\""/,
  'The Settings tile keeps the same class, so both stay in step');
assert.match(html, /configManager\.getConfig\(\)\.head_clock \? "<span class=\\"head-time\\" data-hour12=\\""\s*: "<span class=\\"head-time is-off\\" data-hour12=\\"";/);
assert.match(readRepoFile('src/web/assets/admin.css'), /\.head-bar-preview \.head-time\.is-off \{ visibility:hidden; \}/);

const save = extractDeliveredFunction('saveHeadSwitch');
const page = `<!doctype html><html><body>
<input type="checkbox" class="head-bar-clock" checked><input type="checkbox" class="head-bar-clock" checked>
<input type="checkbox" class="head-bar-overview" checked>
<div class="head-bar-preview"><span class="head-time">12:00</span></div><div class="head-bar-preview"><span class="head-time">12:00</span></div>
<pre id="result">running</pre><script>
const posts = [];
let failNext = false;
window.fetch = async (url, options) => { posts.push(url + ' ' + options.body); return {ok: !failNext}; };
const notes = [];
function showNotification(text, ok) { notes.push(text + ':' + ok); }
function t(key) { return key; }
${inlineScriptSafe(save)}
(async () => {
  const fails = [];
  const check = (ok, message) => { if (!ok) fails.push(message); };
  const boxes = cls => [...document.querySelectorAll('.' + cls)].map(box => box.checked).join();
  const times = () => [...document.querySelectorAll('.head-time')].map(time => time.classList.contains('is-off')).join();
  await saveHeadSwitch('clock', false);
  check(boxes('head-bar-clock') === 'false,false', 'Every copy of the time option follows: ' + boxes('head-bar-clock'));
  check(times() === 'true,true', 'The previews hide the time: ' + times());
  check(boxes('head-bar-overview') === 'true', 'The overview option stays');
  check(posts[0] === 'api/display/head part=clock&enabled=0', 'Saved at once: ' + posts[0]);
  await saveHeadSwitch('overview', false);
  check(posts[1] === 'api/display/head part=overview&enabled=0' && times() === 'true,true', 'The overview: ' + posts[1]);
  failNext = true;
  await saveHeadSwitch('clock', true);
  check(boxes('head-bar-clock') === 'false,false' && times() === 'true,true', 'A failed save goes back');
  check(notes.length === 1, 'A failed save tells: ' + notes.join());
  const result = document.getElementById('result');
  result.textContent = fails.join('; ') || 'ok';
  document.body.dataset.result = fails.length ? 'fail' : 'pass';
})();
</script></body></html>`;
runDomHarness({label: 'Head bar options', html: page, tmpPrefix: 'hometiles-head-options-'});
console.log('Head bar options: gear, time and overview stored at once, the dots without the overview take no touch');
