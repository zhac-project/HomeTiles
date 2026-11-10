// The preview is the scaled screen without a bezel (user 2026-10-10: the
// black frame around it is gone everywhere): grid tiles and half-position
// tiles sit at the panel's margins, and the screensaver image fills the
// whole screen. The screen fills the former preview height.
import assert from 'node:assert/strict';
import {readRepoFile} from '../../lib/admin-source.mjs';
import {runDomHarness} from '../../lib/headless-dom.mjs';

const css = readRepoFile('src/web/assets/admin.css');
const vars = '--grid-cols:7;--grid-rows:5;--preview-cell-w:90.37px;--preview-cell-h:78px;--preview-gap:8.61px;' +
  '--preview-pad:2.15px;--preview-pad-left:2.15px;--preview-pad-right:2.15px;--preview-pad-top:2.69px;' +
  '--preview-pad-bottom:3.23px;--tile-radius:17px;' +
  '--screensaver-image-radius:calc(var(--tile-radius) + 2.15px);';
const html = `<!doctype html><html><head><style>:root{${vars}} ${css}</style></head><body>
<div id="grid" class="tile-grid screensaver-tile-grid"><div class="screensaver-grid-image-frame"></div>
<div id="cell" class="tile" style="grid-column:2 / span 1;grid-row:2 / span 1"></div>
<div id="half" class="tile fractional-tile" style="--tile-col:1;--tile-row:1;--tile-w:1;--tile-h:1"></div></div>
<pre id="result"></pre><script>
try{
 const check=(v,m)=>{if(!v)throw Error(m);};
 const grid=document.getElementById('grid').getBoundingClientRect();
 const border=parseFloat(getComputedStyle(document.getElementById('grid')).borderLeftWidth);
 const cell=document.getElementById('cell').getBoundingClientRect();
 const half=document.getElementById('half').getBoundingClientRect();
 check(Math.abs(cell.left-half.left)<0.05&&Math.abs(cell.top-half.top)<0.05,'Grid and half-position tiles share the margins: '+cell.left+'/'+half.left+' '+cell.top+'/'+half.top);
 const left=cell.left-grid.left-border, top=cell.top-grid.top-border;
 check(Math.abs(left-(2.15+90.37+8.61))<0.05,'Column 2 sits behind the margin only: '+left);
 check(Math.abs(top-(2.69+78+8.61))<0.05,'Row 2 sits behind the margin only: '+top);
 const frame=document.querySelector('.screensaver-grid-image-frame').getBoundingClientRect();
 check(Math.abs(frame.left-grid.left-border)<0.05&&Math.abs(grid.right-border-frame.right)<0.05,'The screensaver image fills the whole screen');
 document.body.dataset.result='pass';document.getElementById('result').textContent='Preview without a bezel: tiles at the panel margins';
}catch(error){document.body.dataset.result='fail';document.getElementById('result').textContent=error.stack;}
</script></body></html>`;
try { runDomHarness({label:'Preview without a bezel', html, tmpPrefix:'hometiles-preview-frame-'}); }
catch(error) { throw new Error(error.message.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || error.message.slice(0,400)); }
const styles = readRepoFile('src/web/server/render/web_admin_styles.cpp').replace(/\r\n/g, '\n');
assert.ok(!/kPreviewFramePx|--preview-frame/.test(styles), 'No bezel is emitted');
assert.ok(!/--preview-frame|--screensaver-image-inset/.test(css), 'No bezel in the preview CSS');
assert.ok(!readRepoFile('src/web/admin/tiles/layout-window.js').includes('--preview-frame'), 'No bezel in the layout window');
// The screen fills the target height: the preview keeps its former size, and
// the settings panel beside it is not cut (user 2026-10-02).
assert.match(styles, /const int screen_h = preview_target_height_px\(\);/);
console.log('Preview without a bezel: tiles at the panel margins, the screensaver image fills the screen');
