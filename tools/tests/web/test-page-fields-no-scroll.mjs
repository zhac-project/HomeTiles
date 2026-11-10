// Home's preview with its page fields must not overflow its scroll box
// (user 2026-10-15, Tab5 with Windows at 125 %: scroll bars came and went
// around the preview all the time; at 100 % nothing was missing). The
// fields' black box took the grid's rounded clientWidth/-Height and both
// boxes a fixed 1 px border, which Chrome draws 0.8 px wide at 1.25 device
// pixels per CSS pixel: a fraction of a pixel past the grid, enough for
// scroll bars. Tab5's bar layout (fields under the 5 x 3 screen, cells
// 236 x 181, preview cell height 98 px) and the S3's (fields beside the
// 3 x 3 screen, cells 146 x 122, 109 px).
import {readAdminDeliverySource, readRepoFile, inlineScriptSafe} from '../../lib/admin-source.mjs';
import {runDomHarness} from '../../lib/headless-dom.mjs';

const PANELS = [
  {name: 'Tab5', profileCols: 7, profileRows: 4, cols: 5, rows: 3, cellW: 236, cellH: 181, previewH: 98,
   gap: 16, padLeft: 18, padRight: 18, padTop: 128, padBottom: 17, radius: 32},
  {name: 'S3', profileCols: 3, profileRows: 3, cols: 3, rows: 3, cellW: 146, cellH: 122, previewH: 109,
   gap: 10, padLeft: 11, padRight: 11, padTop: 84, padBottom: 10, radius: 22}
];

function page(panel) {
  const tiles = panel.profileCols * panel.profileRows;
  const scale = panel.previewH / panel.cellH;
  const px = lvgl => (lvgl * scale).toFixed(2) + 'px';
  return `<!doctype html><html><head><style>
${readRepoFile('src/web/assets/admin.css')}
:root { --grid-cols:${panel.cols}; --grid-rows:${panel.rows}; --preview-cell-h:${panel.previewH}px; --preview-cell-w:${px(panel.cellW)};
 --preview-gap:${px(panel.gap)}; --preview-pad:${px(panel.gap)}; --preview-pad-left:${px(panel.padLeft)}; --preview-pad-right:${px(panel.padRight)};
 --preview-pad-top:${px(panel.padTop)}; --preview-pad-bottom:${px(panel.padBottom)}; --radius-preview-scale:${scale}; --tile-radius:${px(panel.radius)}; }
</style></head><body>
<div class="wrapper"><div class="card">
<div id="tab-tiles-folder0" class="tile-tab tab-content active" data-folder-id="0"><div class="tile-editor"><div class="tile-editor-main">
<div class="tile-grid-scroll"><div class="tile-grid head-bar-grid" id="folder0Grid">
<div class="head-bar-preview" aria-hidden="true"><span class="head-disc"><i class="mdi mdi-home"></i></span><span class="head-title">Home</span><span class="head-time">11:46</span><span class="head-button head-gear"><i class="mdi mdi-cog"></i></span></div>
${Array.from({length: tiles}, (_, i) => `<div class="tile empty" id="folder0-tile-${i}" data-index="${i}" data-type="0"></div>`).join('')}
</div></div>
<div id="pageSlots" class="page-fields" data-pages="1,2"><div class="page-fields-label">Seiten</div>${
  Array.from({length: 5}, (_, i) => `<div class="page-field" data-slot="${i}"></div>`).join('')}<div id="settingsHiddenSlot" class="tile-grid settings-hidden-slot has-tile" data-in-grid="1"><div id="settingsHiddenTile" class="tile settings-hidden-tile navigate" data-hidden="1"></div></div></div>
</div><div id="folder0Settings" class="tile-settings"><select id="folder0_tile_type"><option value="0">Empty</option></select></div>
</div></div></div></div>
<pre id="result">running</pre><script>
const nativeListen = document.addEventListener.bind(document);
document.addEventListener = (name, ...args) => { if (name !== 'DOMContentLoaded') nativeListen(name, ...args); };
const APP_I18N = {}, CLIMATE_I18N = {}, BINARY_SENSOR_I18N = {};
const GRID_COLS = ${panel.profileCols}, GRID_ROWS = ${panel.profileRows}, GRID_SHOWN_COLS = ${panel.cols}, GRID_SHOWN_ROWS = ${panel.rows}, HEAD_BAR = true;
const TILES_PER_GRID = ${tiles}, ADMIN_WEB_SESSION_TOKEN = 'test', ACTIVE_LAYOUT = 'bar';
const TILE_TYPE_REGISTRY = {4: {label:'Folder',css:'navigate',fields:'navigate',preview:'none'}, 7: {label:'Settings',css:'navigate',fields:'settings_access',preview:'none',locked:true}};
const TILE_TABS = [], TAB_BY_FOLDER = {}, FOLDER_BY_TAB = {}, SCREENSAVER_FOLDER_ID = 65535;
const SCREENSAVER_TILE_DEFAULT_OPACITY = 0, SCREENSAVER_TILE_DEFAULT_COLOR = '#000000';
const MEDIA_TILE_MIN_SPAN = 2, MEDIA_TILE_MAX_SPAN = 3, MEDIA_TILE_TYPE = 15;
const device = Array.from({length: ${tiles}}, () => ({type:0}));
device[0] = {type:4,title:'Radio',icon_name:'radio',navigate_target:1,col:0,row:0,span_w:1,span_h:1,layout_hidden:true};
device[1] = {type:4,title:'Sonstiges',icon_name:'folder',navigate_target:2,col:1,row:0,span_w:1,span_h:1,layout_hidden:true};
window.fetch = async () => ({ok:true, status:200, json:async()=>({success:true})});
${inlineScriptSafe(readAdminDeliverySource())}
(async () => { try {
  initTileTabs();
  folderByTab.folder0 = 0;
  tileDataLoadedTabs.add('folder0');
  tilesData.folder0 = JSON.parse(JSON.stringify(device));
  tilesData.folder0.forEach((tile, i) => renderTileFromData('folder0', i, tile, {}));
  layoutTiles('folder0', tilesData.folder0);
  enableSettingsHiddenSlot();
  enablePageFields();
  await new Promise(resolve => setTimeout(resolve, 100));
  const grid = getTileGrid('folder0'), scroll = grid.closest('.tile-grid-scroll');
  const g = grid.getBoundingClientRect(), cs = getComputedStyle(grid);
  const after = getComputedStyle(grid, '::after'), before = getComputedStyle(grid, '::before');
  const check = (value, message) => { if (!value) throw Error('${panel.name}: ' + message); };
  check(grid.classList.contains('has-page-fields') && parseFloat(after.height) > 0, 'The fields lie on their black box');
  const border = parseFloat(cs.borderLeftWidth);
  check(border > 0.7 && border < 0.9, 'Chrome draws the 1 px border 0.8 px wide at 125 %: ' + border);
  // Both boxes end at the grid's border edges at the most (the border as
  // drawn), not a fraction of a pixel further.
  const edge = (value, limit, what) => check(value <= limit + 0.02, what + ' ' + value + ' past ' + limit);
  edge(border + parseFloat(after.left) + parseFloat(after.width), g.width, 'Fields box right');
  edge(border + parseFloat(after.top) + parseFloat(after.height), g.height, 'Fields box bottom');
  edge(g.width - border - parseFloat(before.right), g.width, 'Screen box right');
  edge(g.height - border - parseFloat(before.bottom), g.height, 'Screen box bottom');
  check(scroll.scrollWidth <= scroll.clientWidth && scroll.scrollHeight <= scroll.clientHeight,
    'No scroll bars around the preview: ' + scroll.scrollWidth + '/' + scroll.clientWidth + ' ' + scroll.scrollHeight + '/' + scroll.clientHeight);
  document.body.dataset.result = 'pass';
} catch (error) { document.body.dataset.result = 'fail'; document.getElementById('result').textContent = error.stack; } })();
</script></body></html>`;
}

for (const panel of PANELS) {
  try {
    runDomHarness({label: `${panel.name} page fields without scroll bars`, html: page(panel), tmpPrefix: 'hometiles-page-fields-scroll-',
      extraArgs: ['--force-device-scale-factor=1.25', '--window-size=1376,900', '--virtual-time-budget=5000']});
  } catch (error) {
    throw Error(error.message.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || error.message.slice(0, 1500));
  }
}
