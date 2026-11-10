// A half-step tile keeps its size while the grid preview draws it again
// (user 2026-10-12: the V2's 2x1.5 analog clock showed its 1x1 face at every
// page load and after every grid render). renderTileFromData set the tile's
// classes anew and dropped the server's fractional-tile, which gives such a
// tile its place: until layoutTiles put it back, the tile was one grid cell,
// and the clock laid out its face for that cell. The size came back within
// the same task, so the resize observer never saw a change. The delivered
// editor runs here on the real admin.css; the clock layout records the size
// it reads.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readAdminDeliverySource, readRepoFile, inlineScriptSafe} from '../../lib/admin-source.mjs';
import {runDomHarness} from '../../lib/headless-dom.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const html = `<!doctype html><html lang="en"><head><style>${readRepoFile('src/web/assets/admin.css')}
:root{--grid-cols:6;--grid-rows:4;--preview-cell-w:100px;--preview-cell-h:80px;--preview-gap:8px;--preview-pad:10px}
</style></head><body>
<div id="tab-tiles-folder0" class="tile-tab tab-content active"><div class="tile-grid">
<div class="tile clock fractional-tile" id="folder0-tile-0" data-type="9" data-col="0" data-row="0" data-span-w="2" data-span-h="1.5"
 style="--tile-col:0;--tile-row:0;--tile-w:2;--tile-h:1.5;grid-column:auto;grid-row:auto"></div>
<div class="tile clock" id="folder0-tile-1" data-type="9" data-col="2" data-row="0" data-span-w="2" data-span-h="1"
 style="grid-column:3 / span 2;grid-row:1 / span 1"></div></div></div>
<pre id="result"></pre><script>
// Skip unrelated boot/network timers; execute the complete delivered editor below.
const nativeListen = document.addEventListener.bind(document);
document.addEventListener = (name, ...args) => { if (name !== 'DOMContentLoaded') nativeListen(name, ...args); };
const APP_I18N = {}, CLIMATE_I18N = {}, BINARY_SENSOR_I18N = {}, GRID_COLS = 6, GRID_ROWS = 4, TILES_PER_GRID = 24, ADMIN_WEB_SESSION_TOKEN = 'test';
const TILE_TYPE_REGISTRY = {9: {css: 'clock', preview: 'clock'}};
const TILE_TABS = [], TAB_BY_FOLDER = {}, FOLDER_BY_TAB = {}, SCREENSAVER_FOLDER_ID = 65535, SCREENSAVER_TILE_DEFAULT_OPACITY = 0,
  SCREENSAVER_TILE_DEFAULT_COLOR = '#000000', MEDIA_TILE_TYPE = 15, MEDIA_TILE_MIN_SPAN = 2, MEDIA_TILE_MAX_SPAN = 3;
window.fetch = async url => { throw Error('Unexpected network access ' + url); };
${inlineScriptSafe(readAdminDeliverySource())}
(async () => { try {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  // Analog (style 1), time and date, the weekday in full: the user's clock.
  const clock = (col, w, h) => ({type: 9, col, row: 0, span_w: w, span_h: h, sensor_decimals: 3,
    sensor_gauge_max: (1 << 13) | (2 << 8), key_code: 40, key_modifier: 24, bg_color: 16777216, sensor_display_mode: 1});
  folderByTab.folder0 = 0;
  tileDataLoadedTabs.add('folder0');
  tilesData.folder0 = [clock(0, 2, 1.5), clock(2, 2, 1)];
  const seen = [];
  const layout = layoutClockFacePreview;
  layoutClockFacePreview = el => { seen.push(el.id + ' ' + el.offsetWidth + 'x' + el.offsetHeight); layout(el); };
  const tile = document.getElementById('folder0-tile-0');
  const size = tile.offsetWidth + 'x' + tile.offsetHeight;
  check(size === '208x124', 'the 2x1.5 tile at its size before the render: ' + size);
  renderTileFromData('folder0', 0, tilesData.folder0[0], sensorMetaCache);
  check(seen.length > 0 && seen.every(entry => entry === 'folder0-tile-0 ' + size),
    'the clock laid out at the tile\\'s own size: ' + seen.join(', '));
  check(tile.classList.contains('fractional-tile'), 'the render keeps the grid place');
  check(tile.classList.contains('clock'), 'and draws a clock');
  // A whole-cell tile is placed by the grid itself and needs no class.
  seen.length = 0;
  renderTileFromData('folder0', 1, tilesData.folder0[1], sensorMetaCache);
  check(!document.getElementById('folder0-tile-1').classList.contains('fractional-tile'), 'no class on a whole tile');
  check(seen.length > 0 && seen.every(entry => entry === 'folder0-tile-1 208x80'), 'the 2x1 clock at its size: ' + seen.join(', '));
  // The shared reset: the type's classes anew, the grid place kept.
  resetTileClasses(tile, ['tile', 'sensor']);
  check(tile.className === 'tile sensor fractional-tile', 'the reset keeps the grid place: ' + tile.className);
  check(tile.offsetWidth + 'x' + tile.offsetHeight === size, 'at its size');
  document.body.dataset.result = 'pass';
} catch (error) { document.body.dataset.result = 'fail'; document.getElementById('result').textContent = error.message; } })();
</script></body></html>`;
try { runDomHarness({label: 'Fractional tile render', html, tmpPrefix: 'hometiles-fractional-render-'}); }
catch (error) { throw Error(error.message.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || error.message.slice(0, 300)); }
// Guard: every render of a grid tile sets its classes through
// resetTileClasses (the live editor did the same as the grid render, which
// b406 only worked around by laying the clock out later). The parked
// Settings tile (settings/access.js) is no grid tile.
const sources = ['src/web/admin/tiles/grid-preview.js', 'src/web/admin/tiles/live-preview.js',
  ...fs.readdirSync(path.join(root, 'src/types')).map(type => `src/types/${type}/admin.js`)
    .filter(file => fs.existsSync(path.join(root, file)))];
for (const file of sources) {
  const direct = readRepoFile(file).match(/\b(?:el|tileElem|tile)\.className\s*=(?!=)/g);
  if (direct) throw Error(`${file} sets a tile's classes directly (${direct.length}x): use resetTileClasses`);
}
const layoutJs = readRepoFile('src/web/admin/tiles/layout.js');
if (!/function resetTileClasses\(el, classes\) \{\s*const fractional = el\.classList\.contains\('fractional-tile'\);[\s\S]{0,200}el\.className = classes\.join\(' '\);\s*if \(fractional\) el\.classList\.add\('fractional-tile'\);/.test(layoutJs)) {
  throw Error('resetTileClasses keeps the grid place');
}
for (const file of ['src/web/admin/tiles/grid-preview.js', 'src/web/admin/tiles/live-preview.js']) {
  if (!readRepoFile(file).includes('resetTileClasses(')) throw Error(`${file} renders through resetTileClasses`);
}
console.log('Fractional tile render: a half-step tile keeps its size while it is drawn again');
