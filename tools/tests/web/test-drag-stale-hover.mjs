// After a tile drag Chrome keeps :hover where the drag started until the
// pointer moves again. The free slot rests on the first free spot, which
// after a drop is often that very spot, and its CSS :hover ring stood dashed
// at the dragged tile's old place (user 2026-10-13: "a kind of previous
// position, until I drag another tile"). The free slot's ring follows the
// pointer only (free-slot-hover, tiles/layout.js); a tile's hover ring waits
// for the pointer's next real move or press. Runs the delivered bundle.
import assert from 'node:assert/strict';
import {inlineScriptSafe, readAdminDeliverySource, readRepoFile} from '../../lib/admin-source.mjs';
import {runDomHarness} from '../../lib/headless-dom.mjs';

const css = readRepoFile('src/web/assets/admin.css');
assert.doesNotMatch(css, /\.tile\.empty:hover/, 'No :hover ring on the free slot');
assert.match(css, /\.tile\.empty\.free-slot-hover:not\(\.active\):not\(\[data-selected="1"\]\) \{ border:3px dashed rgba\(38,166,154,0\.6\); \}/);
assert.match(css, /body\.tile-hover-stale \.tile:not\(\.empty\):hover:not\(\.active\):not\(\[data-selected="1"\]\)::after \{ border-color:transparent; \}/);

const page = `<!doctype html><html><body><pre id="result"></pre><script>
const nativeListen=document.addEventListener.bind(document);
document.addEventListener=(name,fn,...args)=>{if(name!=='DOMContentLoaded')nativeListen(name,fn,...args);};
const APP_I18N={},ENTITY_KIND_LABELS=[],CLIMATE_I18N={},BINARY_SENSOR_I18N={},GRID_COLS=7,GRID_ROWS=5,TILES_PER_GRID=35,ADMIN_WEB_SESSION_TOKEN='test';
const TILE_TYPE_REGISTRY={0:{}},TILE_TABS=[],TAB_BY_FOLDER={},FOLDER_BY_TAB={},SCREENSAVER_FOLDER_ID=65535,SCREENSAVER_TILE_DEFAULT_OPACITY=0;
const SCREENSAVER_TILE_DEFAULT_COLOR='#000000',MEDIA_TILE_TYPE=15,MEDIA_TILE_MIN_SPAN=2,MEDIA_TILE_MAX_SPAN=3;
window.fetch=async()=>({ok:true,json:async()=>({})});
${inlineScriptSafe(readAdminDeliverySource())}
try{
 const check=(v,m)=>{if(!v)throw Error(m);};
 const stale=()=>document.body.classList.contains('tile-hover-stale');
 document.body.dispatchEvent(new DragEvent('dragend',{bubbles:true,clientX:200,clientY:150}));
 check(stale(),'After a drag the hover rings wait');
 document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:201,clientY:151}));
 check(stale(),'Not on a pointer event without a real move');
 document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:240,clientY:150}));
 check(!stale(),'Back on the next real move');
 document.body.dispatchEvent(new DragEvent('dragend',{bubbles:true,clientX:200,clientY:150}));
 document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:200,clientY:150}));
 check(!stale(),'Back on a press');
 document.body.dataset.result='pass';
}catch(error){document.body.dataset.result='fail';document.getElementById('result').textContent=error.stack;}
</script></body></html>`;
try {
  runDomHarness({label: 'Drag stale hover', html: page, tmpPrefix: 'hometiles-stale-hover-'});
} catch (error) {
  throw Error(error.message.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || error.message.slice(0, 600));
}
console.log('Drag stale hover: no ring at the drag\'s start until the pointer really moves, the free slot by the pointer only');
