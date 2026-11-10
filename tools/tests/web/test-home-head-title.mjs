// Home's own title and icon in its head (user 2026-10-13, mockup
// build/design-mockups/pages/kopf-tab.png): the head bar tab between Tile
// and Global has a title field with Auto ("Home" in the panel's language)
// and an icon button (Automatic = the house, no "No icon"), like a tile's
// head; only Home's head takes them, the pages keep their folders' names.
// Stored empty when automatic, one line, at most 31 bytes cut on a UTF-8
// character; the panel's head, the pages' overview and the Web Admin's Home
// previews follow. Runs the delivered Admin bundle in headless Chrome.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {inlineScriptSafe, readAdminDeliverySource, readRepoFile, repoRoot} from '../../lib/admin-source.mjs';
import {cppFunctionDefinitions} from '../../lib/cpp-source.mjs';
import {runDomHarness} from '../../lib/headless-dom.mjs';

const read = file => readRepoFile(file).replace(/\r\n?/g, '\n');

// ---- Stored in the config (NVS head_title / head_icon) ----
const configH = read('src/core/config/config_manager.h');
const config = read('src/core/config/config_manager.cpp');
assert.match(configH, /bool head_overview = true;\n[\s\S]{0,200}char head_title\[32\];\n  char head_icon\[32\];/);
assert.match(configH, /bool saveHomeHead\(const String& title, const String& icon\);/);
assert.match(config, /strcmp\(a\.head_title, b\.head_title\) == 0 &&\s*strcmp\(a\.head_icon, b\.head_icon\) == 0 &&/);
assert.match(config, /config\.head_title\[0\] = '\\0';\s*config\.head_icon\[0\] = '\\0';\s*if \(prefs\.isKey\("head_title"\)\) prefs\.getString\("head_title", config\.head_title, sizeof\(config\.head_title\)\);\s*if \(prefs\.isKey\("head_icon"\)\) prefs\.getString\("head_icon", config\.head_icon, sizeof\(config\.head_icon\)\);/,
  'Read only when stored (no NVS error log on older panels)');
assert.match(config, /prefs\.putString\("head_title", normalized\.head_title\);\s*prefs\.putString\("head_icon", normalized\.head_icon\);/);
const save = config.slice(config.indexOf('bool ConfigManager::saveHomeHead('), config.indexOf('bool ConfigManager::saveTileBorders('));
assert.match(save, /if \(strcmp\(new_title, config\.head_title\) == 0 && strcmp\(new_icon, config\.head_icon\) == 0\) return true;/, 'Nothing written without a change');
assert.match(save, /BatchedNvsWrite::finish\(prefs\)/);

// The cut keeps whole UTF-8 characters (host compiled).
const compiler = ['clang++', 'g++'].find(name => spawnSync(name, ['--version']).status === 0);
if (compiler) {
  const copy = cppFunctionDefinitions(config).find(item => item.name === 'copy_utf8');
  assert.ok(copy, 'copy_utf8');
  const source = `#include <cassert>
#include <cstdint>
#include <cstring>
#include <string>
struct String : std::string { using std::string::string; };
${copy.source}
int main() {
  char out[8];
  copy_utf8("Home", out, sizeof(out)); assert(!std::strcmp(out, "Home"));
  copy_utf8("Wohnung1", out, sizeof(out)); assert(!std::strcmp(out, "Wohnung"));
  // 8 bytes, 7 fit: the 7th would split a character, so 6 stay.
  copy_utf8("Gr\\xc3\\xbc\\xc3\\x9f\\xc3\\x9f", out, sizeof(out)); assert(!std::strcmp(out, "Gr\\xc3\\xbc\\xc3\\x9f"));
  copy_utf8("", out, sizeof(out)); assert(out[0] == 0);
}
`;
  const directory = path.join(repoRoot, 'build/tests/home-head-title');
  fs.mkdirSync(directory, {recursive: true});
  fs.writeFileSync(path.join(directory, 'test.cpp'), source);
  const binary = path.join(directory, process.platform === 'win32' ? 'test.exe' : 'test');
  const compiled = spawnSync(compiler, ['-std=c++17', path.join(directory, 'test.cpp'), '-o', binary], {encoding: 'utf8'});
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
  const run = spawnSync(binary, [], {encoding: 'utf8'});
  assert.equal(run.status, 0, run.stdout + run.stderr);
}

// ---- The request ----
assert.match(read('src/web/server/web_admin.cpp'),
  /server\.on\("\/api\/display\/home-head", HTTP_POST,\s*guarded\(withStorageHold\(\[this\]\(\) \{ this->handleSaveHomeHead\(\); \}\)\)\);/);
const handlers = read('src/web/server/handlers/web_admin_handlers.cpp');
const handler = handlers.slice(handlers.indexOf('void WebAdminServer::handleSaveHomeHead()'), handlers.indexOf('void WebAdminServer::handleSaveTheme()'));
assert.match(handler, /title\.replace\("\\r", " "\);\s*title\.replace\("\\n", " "\);\s*title\.trim\(\);/, 'One line');
assert.match(handler, /configManager\.saveHomeHead\(title, normalizeMdiIconName\(server\.arg\("icon"\)\)\)/, 'The icon as the icon list names it');
assert.match(handler, /tiles_rebuild_heads\(!powerManager\.isInSleep\(\)\);/, 'Only the heads, at once');
assert.doesNotMatch(handler, /tiles_request_reload_all|tiles_invalidate_folder/, 'No grid built again (user 2026-10-14: it took a while)');

// ---- The panel: Home's head and the pages' overview ----
const bar = read('src/ui/tabs/tiles/home_bar.cpp');
assert.match(bar, /const char\* home_title\(const char\* fallback\) \{\s*const char\* own = configManager\.getConfig\(\)\.head_title;\s*return own\[0\] \? own : fallback;\s*\}/);
assert.match(bar, /const char\* home_icon\(\) \{\s*const char\* own = configManager\.getConfig\(\)\.head_icon;\s*return own\[0\] \? own : "home";\s*\}/);
assert.match(bar, /const char\* icon_name = home \? home_icon\(\) : \(folder && folder->icon_name\[0\] \? folder->icon_name : "folder"\);/);
assert.match(bar, /const char\* title_text = home \? home_title\(tr\.home\) : \(folder && folder->name\[0\] \? folder->name : tr\.home\);/,
  'Only Home: a page keeps its folder\'s name');
assert.match(read('src/ui/tabs/tiles/page_preview.cpp'), /lv_label_set_text\(name, i == 0 \? home_bar::home_title\(tr\.home\) :/);

// ---- The Web Admin: the tab and Home's previews ----
const html = read('src/web/server/render/web_admin_html.cpp');
assert.match(html, /const String icon = home \? normalizeMdiIconName\(String\(home_bar::home_icon\(\)\)\)/);
assert.match(html, /if \(home\) html \+= " home-head";/);
assert.match(html, /appendHtmlEscaped\(html, home \? String\(home_bar::home_title\(tr\.home\)\) : !folder\.name\[0\] \? String\(tr\.home\) : String\(folder\.name\)\);/);
const pane = html.slice(html.indexOf('  String head_panel;'), html.indexOf('    const auto head_toggle'));
for (const marker of ['"_tile_title_auto\\" data-auto-title=\\"";', 'appendHtmlEscaped(head_panel, tr.home);',
  'appendHtmlEscaped(head_panel, tr.head_bar_home_auto_hint);', 'appendHtmlEscaped(head_panel, tr.head_bar_home_title);',
  '<textarea rows=\\"1\\" maxlength=\\"31\\" class=\\"tile-title-input home-head-title\\" ',
  'appendHtmlEscaped(head_panel, home_bar::home_title(tr.home));', 'appendHtmlEscaped(head_panel, tr.tile_group_icon);',
  '"_tile_icon\\" data-tile-icon data-auto-icon=\\"home\\" value=\\"";', 'appendHtmlEscaped(head_panel, display.head_icon);']) {
  assert.ok(pane.includes(marker), 'Head bar tab: ' + marker);
}
// Every pane's heading is its tab's name (user 2026-10-13: no "settings").
assert.match(html, /appendHtmlEscaped\(head_panel, tr\.head_bar_heading\);/);
assert.equal(html.match(/tr\.panel_tab_global\);/g)?.length >= 2, true);
assert.match(html, /<div class="tile-head-top"><h3>\)html";\s*appendHtmlEscaped\(html, tr\.panel_tab_tile\);/);
assert.match(html, /<div id="screensaverBackgroundSettings" class="screensaver-background-settings">\n<div class="tile-settings-head"><h3 style="margin-top:0;">\)html";\s*appendHtmlEscaped\(html, tr\.admin_slideshow\);/);

// ---- The browser: typing, Auto, the icon, every copy and preview ----
const appI18n = {iconPickerAuto: 'Automatisch', iconPickerAutoHint: 'Das Haus', iconPickerNone: 'Kein Icon',
  iconPickerNoneHint: 'Ohne', iconPickerNoMatch: 'Nichts für {query}', iconPickerSearch: 'z.B. home', networkError: 'Netzwerkfehler',
  networkErrorSave: 'Nicht gespeichert', entityPickerRetry: 'Erneut'};
const headPane = tab => `<div class="tile-settings" id="${tab}Settings" data-pane="head" style="width:390px">
<div class="panel-head"><section class="global-settings-panel"><h3>Kopfleiste</h3>
<div class="tile-head-row"><div><div class="tile-title-label"><label for="${tab}_head_tile_title">Home-Titel</label><button type="button" class="tile-title-auto" id="${tab}_head_tile_title_auto" data-auto-title="Home" aria-pressed="false">Auto</button></div><textarea rows="1" maxlength="31" class="tile-title-input home-head-title" spellcheck="false" id="${tab}_head_tile_title" placeholder="Home">Home</textarea></div><div><label for="${tab}_head_tile_icon_picker">Icon</label><input type="hidden" class="home-head-icon" id="${tab}_head_tile_icon" data-tile-icon data-auto-icon="home" value=""><button type="button" class="tile-icon-picker" id="${tab}_head_tile_icon_picker" aria-haspopup="listbox"></button></div></div>
</section></div></div>`;
const preview = (home, title, icon) => `<div class="tile-grid head-bar-grid" style="position:relative;height:60px;width:600px"><div class="head-bar-preview${home ? ' home-head' : ''}"><span class="head-disc"><i class="mdi mdi-${icon}"></i></span><span class="head-title">${title}</span></div></div>`;
const page = `<!doctype html><html lang="de"><head><style>${read('src/web/assets/admin.css')}</style></head><body>
${preview(true, 'Home', 'home')}${preview(true, 'Home', 'home')}${preview(false, 'Lighting', 'lightbulb')}
${headPane('folder0')}${headPane('folder1')}
<pre id="result"></pre><script>
const loaded=[];const nativeListen=document.addEventListener.bind(document);
document.addEventListener=(name,fn,...args)=>{if(name==='DOMContentLoaded')loaded.push(fn);else nativeListen(name,fn,...args);};
const APP_I18N=${JSON.stringify(appI18n)};const ENTITY_KIND_LABELS=[];
const CLIMATE_I18N={},BINARY_SENSOR_I18N={},GRID_COLS=7,GRID_ROWS=5,TILES_PER_GRID=35,ADMIN_WEB_SESSION_TOKEN='test';
const TILE_TYPE_REGISTRY={0:{}};
const TILE_TABS=[],TAB_BY_FOLDER={},FOLDER_BY_TAB={},SCREENSAVER_FOLDER_ID=65535,SCREENSAVER_TILE_DEFAULT_OPACITY=0,SCREENSAVER_TILE_DEFAULT_COLOR='#000000',MEDIA_TILE_TYPE=15,MEDIA_TILE_MIN_SPAN=2,MEDIA_TILE_MAX_SPAN=3;
const posts=[];
window.fetch=async(url,options)=>{
  if(String(url).includes('api/mdi_icons'))return{ok:true,text:async()=>'home\\nhome-heart\\nhome-outline\\nlightbulb\\n'};
  if(options&&options.method==='POST')posts.push(url+' '+options.body);
  return{ok:true,json:async()=>({success:true})};
};
${inlineScriptSafe(readAdminDeliverySource())}
(async()=>{try{
 const check=(v,m)=>{if(!v)throw Error(m);};const $=id=>document.getElementById(id);
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 loaded.filter(fn=>/setupTileHeads\\(document\\)/.test(String(fn))).forEach(fn=>fn());
 const title=$('folder0_head_tile_title'),auto=$('folder0_head_tile_title_auto'),icon=$('folder0_head_tile_icon'),button=$('folder0_head_tile_icon_picker');
 const titles=()=>[...document.querySelectorAll('.head-bar-preview .head-title')].map(el=>el.textContent).join();
 const discs=()=>[...document.querySelectorAll('.head-bar-preview .head-disc > i')].map(el=>el.className.replace('mdi mdi-','')).join();
 // Automatic at the start: Auto lit, the house on the button.
 check(auto.classList.contains('on')&&!auto.disabled&&auto.getAttribute('aria-pressed')==='true','Auto lit for "Home"');
 check(button.querySelector('.mdi-home')&&button.title==='Automatisch','The house, automatic');
 // Typing: Auto goes off, every copy and Home's previews follow, the pages'
 // keep their name; saved after a pause, not per key.
 title.value='Wohnung';title.dispatchEvent(new Event('input',{bubbles:true}));
 check(!auto.classList.contains('on'),'Typing turns Auto off');
 check(titles()==='Wohnung,Wohnung,Lighting','Home\\'s previews follow, a page\\'s not: '+titles());
 check($('folder1_head_tile_title').value==='Wohnung'&&!$('folder1_head_tile_title_auto').classList.contains('on'),'The other page\\'s copy follows');
 check(!posts.length,'Not saved per key');
 await wait(700);
 check(posts.length===1&&posts[0]==='api/display/home-head title=Wohnung&icon=','Saved after the pause: '+posts.join(' | '));
 // One line: Enter is no second line, a pasted break a space.
 const enter=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});title.dispatchEvent(enter);
 check(enter.defaultPrevented,'No second line');
 title.value='Haus\\nOben';title.dispatchEvent(new Event('input',{bubbles:true}));
 check(title.value==='Haus Oben'&&titles().startsWith('Haus Oben'),'A pasted break is a space: '+title.value);
 // The icon list: Automatic only (Home's head always has its circle).
 button.click();await wait(20);await wait(20);
 const pop=document.querySelector('.icon-picker-popover.open');
 const choices=[...pop.querySelectorAll('.icon-picker-choice')];
 check(choices.length===1&&choices[0].dataset.icon===''&&choices[0].querySelector('.mdi-home')&&pop.querySelector('.icon-picker-choices.single'),
   'Only Automatic, with the house');
 pop.querySelector('.icon-picker-cell[data-icon="home-heart"]').click();
 check(icon.value==='home-heart'&&$('folder1_head_tile_icon').value==='home-heart'&&button.querySelector('.mdi-home-heart'),'An icon chosen, every copy');
 check(discs()==='home-heart,home-heart,lightbulb','Home\\'s previews take it: '+discs());
 await wait(20);
 check(posts.length===2&&posts[1]==='api/display/home-head title=Haus%20Oben&icon=home-heart','An icon saved at once, with the title typed before: '+posts.join(' | '));
 // Auto: "Home" again, stored empty; Automatic: the house again.
 auto.click();
 check(title.value==='Home'&&auto.classList.contains('on')&&titles()==='Home,Home,Lighting','Auto brings "Home" back');
 button.click();await wait(20);document.querySelector('.icon-picker-choice[data-icon=""]').click();
 check(icon.value===''&&discs()==='home,home,lightbulb'&&button.querySelector('.mdi-home'),'Automatic: the house');
 await wait(700);
 check(posts[posts.length-1]==='api/display/home-head title=&icon=','Both automatic, stored empty: '+posts[posts.length-1]);
 // An emptied field shows Auto's name when left.
 title.value='';title.dispatchEvent(new Event('input',{bubbles:true}));title.dispatchEvent(new Event('change',{bubbles:true}));
 check(title.value==='Home'&&auto.classList.contains('on'),'Emptied: "Home" again');
 document.body.dataset.result='pass';
}catch(error){document.body.dataset.result='fail';document.getElementById('result').textContent=error.stack;}})();
</script></body></html>`;
let domChecked = false;
try {
  domChecked = runDomHarness({label: 'Home head title', html: page, tmpPrefix: 'hometiles-home-head-',
    extraArgs: ['--virtual-time-budget=8000']}) !== false;
} catch (error) {
  throw Error(error.message.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || error.message.slice(0, 600));
}
console.log(`Home head title and icon: stored, panel head and overview, Web Admin tab${domChecked ? ', editor DOM' : ''}`);
