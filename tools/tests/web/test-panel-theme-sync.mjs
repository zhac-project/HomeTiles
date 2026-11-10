// A design chosen on the panel (Settings > Display, the setup) or Automatic
// turning at dusk reaches an open Web Admin page (user 2026-10-14: the page
// kept the old design). The language poll (/api/language, every 15 s and when
// the tab shows again) brings the stored choice and the shown look; the
// Global tabs' design fields and the previews follow, not while the page
// saves a design itself. Runs the delivered bundle in headless Chrome.
import assert from 'node:assert/strict';
import {inlineScriptSafe, readAdminDeliverySource, readRepoFile} from '../../lib/admin-source.mjs';
import {runDomHarness} from '../../lib/headless-dom.mjs';

const handlers = readRepoFile('src/web/server/handlers/web_admin_handlers.cpp');
const language = handlers.slice(handlers.indexOf('void WebAdminServer::handleLanguage() {'));
assert.match(language, /json \+= ",\\"theme\\":";\s*json \+= String\(cfg\.theme\);\s*json \+= ui_theme::theme_light\(\) \? ",\\"theme_shown\\":1" : ",\\"theme_shown\\":0";/,
  'The poll answers with the stored design and the shown look');
assert.match(readRepoFile('src/web/admin/core/localization.js'),
  /applyPanelClockFormats\(Number\(data\?\.time_format\), Number\(data\?\.date_format\)\);\s*if \(typeof applyPanelThemeFromDevice === 'function'\) applyPanelThemeFromDevice\(data\?\.theme, data\?\.theme_shown\);/);

const segment = () => '<div class="icon-color-segmented choice-row global-theme" role="group">' +
  ['0', '1', '2'].map(v => `<button type="button" data-theme="${v}"${v === '0' ? ' class="active"' : ''}>${v}</button>`).join('') + '</div>';
const page = `<!doctype html><html lang="de" data-panel-theme="dark"><body>${segment()}${segment()}
<pre id="result"></pre><script>
const nativeListen=document.addEventListener.bind(document);
document.addEventListener=(name,fn,...args)=>{if(name!=='DOMContentLoaded')nativeListen(name,fn,...args);};
const APP_I18N={},ENTITY_KIND_LABELS=[],CLIMATE_I18N={},BINARY_SENSOR_I18N={},GRID_COLS=7,GRID_ROWS=5,TILES_PER_GRID=35,ADMIN_WEB_SESSION_TOKEN='test';
const TILE_TYPE_REGISTRY={0:{}},TILE_TABS=[],TAB_BY_FOLDER={},FOLDER_BY_TAB={},SCREENSAVER_FOLDER_ID=65535,SCREENSAVER_TILE_DEFAULT_OPACITY=0;
const SCREENSAVER_TILE_DEFAULT_COLOR='#000000',MEDIA_TILE_TYPE=15,MEDIA_TILE_MIN_SPAN=2,MEDIA_TILE_MAX_SPAN=3;
let answer={language:'de',time_format:1,date_format:1,theme:0,theme_shown:0};
let release=null;
window.fetch=async(url,options)=>{
  if(String(url).startsWith('api/language'))return{ok:true,json:async()=>JSON.parse(JSON.stringify(answer))};
  if(String(url).startsWith('api/display/theme')){await new Promise(r=>{release=r;});return{ok:true,json:async()=>({success:true,theme:2,effective:0})};}
  return{ok:true,json:async()=>({})};
};
${inlineScriptSafe(readAdminDeliverySource())}
(async()=>{try{
 const check=(v,m)=>{if(!v)throw Error(m);};
 const active=()=>[...document.querySelectorAll('.global-theme [data-theme].active')].map(b=>b.dataset.theme).join();
 const look=()=>document.documentElement.dataset.panelTheme;
 // Light chosen on the panel: both fields and the previews follow.
 answer={...answer,theme:1,theme_shown:1};
 await checkDeviceLanguage();
 check(active()==='1,1'&&look()==='light','Light from the panel: '+active()+' '+look());
 // Automatic at night: the field says Automatic, the look stays dark.
 answer={...answer,theme:2,theme_shown:0};
 await checkDeviceLanguage();
 check(active()==='2,2'&&look()==='dark','Automatic at night: '+active()+' '+look());
 // Automatic turning light at dawn: only the look changes.
 answer={...answer,theme:2,theme_shown:1};
 await checkDeviceLanguage();
 check(active()==='2,2'&&look()==='light','Automatic by day: '+look());
 // While the page saves a design itself the poll leaves it alone.
 const saving=saveTheme('0');
 answer={...answer,theme:2,theme_shown:1};
 await checkDeviceLanguage();
 check(active()==='0,0'&&look()==='dark','A save in flight wins: '+active()+' '+look());
 release();await saving;
 document.body.dataset.result='pass';
}catch(error){document.body.dataset.result='fail';document.getElementById('result').textContent=error.stack;}})();
</script></body></html>`;
try {
  runDomHarness({label: 'Panel theme sync', html: page, tmpPrefix: 'hometiles-theme-sync-', extraArgs: ['--virtual-time-budget=5000']});
} catch (error) {
  throw Error(error.message.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || error.message.slice(0, 600));
}
console.log('Panel theme sync: a design chosen on the panel reaches the page (fields and previews), not over its own save');
