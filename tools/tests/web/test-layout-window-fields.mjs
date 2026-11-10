// The layout window's page fields (user 2026-10-13: the window had its own
// page row, a second system with its own sizes and drags): Home's fields
// beside the window's area, the delivered Web Admin code on a Guition V2
// (classic 7 x 5, bar 6 x 4, upright 4 x 6.5). A page is its folder's own
// tile in its field, never red; a Home folder dropped on a free field
// becomes a page, a page onto the area a folder tile again as one cell, a
// page onto another one swaps. Every layout has its Settings field (user
// 2026-10-13: Settings is parked per layout): only the Settings tile goes
// in, out again in its own size; the classic layout shows it alone (no
// pages there) and keeps the fields' room, so the window keeps its size;
// a layout stored with Settings parked shows it in its field; nothing
// reaches the panel before "Speichern", which sends the pages and the
// parking with the places.
import {readAdminDeliverySource, readRepoFile, inlineScriptSafe} from '../../lib/admin-source.mjs';
import {runDomHarness} from '../../lib/headless-dom.mjs';

const TILES = 35;
const S = 82 / 152;
const px = v => (v * S).toFixed(2) + 'px';
const LAYOUTS = {
  classic: {name: 'Klassisch', cols: 7, rows: 5, bar: false, portrait: false, available: true, switchable: true,
    screenW: 1280, screenH: 800, cellW: 164, cellH: 140, padLeft: 18, padRight: 18, padTop: 18, padBottom: 18},
  bar: {name: 'Kopfleiste quer', cols: 6, rows: 4, bar: true, portrait: false, available: true, switchable: true,
    screenW: 1280, screenH: 800, cellW: 194, cellH: 152, padLeft: 18, padRight: 18, padTop: 128, padBottom: 16},
  portrait: {name: 'Kopfleiste hochkant', cols: 4, rows: 6.5, bar: true, portrait: true, available: true, switchable: true,
    screenW: 800, screenH: 1280, cellW: 180, cellH: 161, padLeft: 16, padRight: 16, padTop: 129, padBottom: 17},
};
const tile = (type, title, icon, col, row, w, h, view, extra = {}) =>
  ({type, title, icon_name: icon, col, row, span_w: w, span_h: h, view_id: view, ...extra});
const home = [
  tile(4, 'Lighting', 'lightbulb-group', 0, 0, 1, 1, 101, {navigate_target: 1}),
  tile(4, 'MISC', 'dots-grid', 1, 0, 1, 1, 102, {navigate_target: 2}),
  tile(4, 'Climate', 'thermostat', 2, 0, 1, 1, 103, {navigate_target: 3}),
  tile(2, 'Movie', 'movie-open', 3, 0, 1, 1, 104),
  tile(5, 'Coffee', 'coffee-maker', 0, 1, 1, 1, 105),
  tile(2, 'Good night', 'weather-night', 0, 2, 2, 1, 106),
  tile(4, 'Security', 'shield-home', 2, 1, 1, 1, 107, {navigate_target: 4}),
  tile(7, 'Settings', 'cog', 6, 4, 1, 1, 108),
];
while (home.length < TILES) home.push({type: 0});
const classicOf = list => list.map((t, slot) => t.type ? [slot, t.view_id, t.col, t.row, t.span_w, t.span_h] : null).filter(Boolean);
const barPlaces = {103: [0, 0, 1, 1], 104: [1, 0, 1, 1], 105: [2, 0, 1, 1], 106: [0, 1, 2, 1], 107: [2, 1, 1, 1], 108: [5, 3, 1, 1]};
// Settings parked in the upright layout only (classic, bar, portrait).
const layoutData = {success: true, classic: {0: classicOf(home)}, places: {pages: [1, 0, 2], bar: {0: barPlaces}, portrait: {0: barPlaces}},
  clock: {}, settings: {parked: [false, false, true]}};
const grid = (tab, cls) => `<div class="tile-grid-scroll"><div class="${cls}" id="${tab}Grid">
<div class="head-bar-preview" aria-hidden="true"><span class="head-disc"><i class="mdi mdi-home"></i></span><span class="head-title">Home</span><span class="head-time">04:42</span><span class="head-button head-gear"><i class="mdi mdi-cog"></i></span></div>
${Array.from({length: TILES}, (_, i) => `<div class="tile empty" id="${tab}-tile-${i}" data-index="${i}" data-type="0" draggable="true"></div>`).join('')}
</div></div>`;

const folderTab = (id, name) => `<div id="tab-tiles-folder${id}" class="tile-tab tab-content" data-tab-id="folder${id}" data-folder-id="${id}" data-folder-name="${name}" data-folder-icon="folder"><div class="tile-editor"><div class="tile-editor-main">${grid('folder' + id, 'tile-grid head-bar-grid')}</div></div></div>`;

const html = `<!doctype html><html><head><style>
${readRepoFile('src/web/assets/admin.css')}
:root { --grid-cols:6; --grid-rows:4; --preview-cell-w:${px(194)}; --preview-cell-h:82px; --preview-gap:${px(16)};
  --preview-pad:${px(16)}; --preview-pad-left:${px(18)}; --preview-pad-right:${px(18)}; --preview-pad-top:${px(128)};
  --preview-pad-bottom:${px(16)}; --radius-preview-scale:${S.toFixed(8)}; --tile-radius:${px(31)}; --pv-screen:#000000;
  --admin-wrapper-width:1200px; --head-screen-w:${px(1280)}; --head-close-x:640px; --head-time-x:540px; --head-title-w:470px; }
</style></head><body>
<div class="wrapper with-page-fields"><div id="tab-tiles-folder0" class="tile-tab tab-content active" data-tab-id="folder0" data-folder-id="0"><div class="tile-editor"><div class="tile-editor-main">
${grid('folder0', 'tile-grid head-bar-grid')}
<div id="pageSlots" class="page-fields" data-pages="1,0,2"><div class="page-fields-label">Seiten</div>${Array.from({length: 5}, (_, i) => `<div class="page-field" data-slot="${i}"></div>`).join('')}<div id="settingsHiddenSlot" class="tile-grid settings-hidden-slot" data-in-grid="1"><div id="settingsHiddenTile" class="tile settings-hidden-tile empty" data-hidden="0"><i class="mdi mdi-tray-arrow-down tile-icon"></i></div></div></div>
</div></div></div>
${[[1, 'Lighting'], [2, 'MISC'], [3, 'Climate']].map(([id, name]) => folderTab(id, name)).join('\n')}
<div id="tab-network" class="tab-content"></div>
</div>
<div class="tab-nav"><div id="folderTabs">${[[1, 'Lighting'], [2, 'MISC'], [3, 'Climate'], [4, 'Security']].map(([id, name]) =>
  `<button class="tab-btn folder-tab-btn" data-folder-id="${id}" data-folder-parent="0" data-folder-name="${name}" data-folder-icon="folder" data-tab-id="folder${id}" type="button"></button>`).join('')}</div></div>
<pre id="result">running</pre>
<script>
const nativeListen = document.addEventListener.bind(document);
document.addEventListener = (name, ...args) => { if (name !== 'DOMContentLoaded') nativeListen(name, ...args); };
const APP_I18N = {pagesTitle: 'Seiten', save: 'Speichern', layoutSaved: 'Gespeichert'}, CLIMATE_I18N = {}, BINARY_SENSOR_I18N = {};
let GRID_COLS = 7, GRID_ROWS = 5, GRID_SHOWN_COLS = 6, GRID_SHOWN_ROWS = 4, HEAD_BAR = true;
const LAYOUTS = ${JSON.stringify(LAYOUTS)};
const ACTIVE_LAYOUT = 'bar';
const TILES_PER_GRID = ${TILES}, ADMIN_WEB_SESSION_TOKEN = 'test';
const TILE_TYPE_REGISTRY = {2:{label:'Scene',css:'scene',fields:'scene',preview:'none'},4:{label:'Folder',css:'navigate',fields:'navigate',preview:'none'},
  5:{label:'Switch',css:'switch',fields:'switch',preview:'switch'},7:{label:'Settings',css:'navigate',fields:'settings_access',preview:'none',locked:true}};
const TILE_TABS = [], TAB_BY_FOLDER = {}, FOLDER_BY_TAB = {}, SCREENSAVER_FOLDER_ID = 65535, SCREENSAVER_MAX_WALLPAPERS = 500;
const SCREENSAVER_TILE_DEFAULT_OPACITY = 0, SCREENSAVER_TILE_DEFAULT_COLOR = '#000000';
const MEDIA_TILE_MIN_SPAN = 2, MEDIA_TILE_MAX_SPAN = 3, MEDIA_TILE_TYPE = 15;
let PANEL_TIME_FORMAT = 1, PANEL_DATE_FORMAT = 1;
const HOME = ${JSON.stringify(home)};
const LAYOUT_DATA = ${JSON.stringify(layoutData)};
// Security's page is not loaded: the window loads it when its tab shows.
const SECURITY_TAB = ${JSON.stringify(folderTab(4, 'Security'))};
let folderTabLoads = 0;
const log = [], posts = [];
window.addEventListener('error', event => log.push('ERR ' + event.message));
window.confirm = () => true;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const reply = data => ({ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data)});
window.fetch = async (url, options) => {
  url = String(url);
  if (options?.method === 'POST') {
    posts.push([url, options.body]);
    return reply({success: true});
  }
  const m = /api\\/tiles\\?folder=(\\d+)/.exec(url);
  if (m) {
    const list = Number(m[1]) === 0 ? HOME.slice() : [];
    while (list.length < TILES_PER_GRID) list.push({type: 0});
    return reply(JSON.parse(JSON.stringify(list)));
  }
  if (url.startsWith('api/layouts')) return reply(JSON.parse(JSON.stringify(LAYOUT_DATA)));
  if (url.startsWith('api/folders/tab?folder_id=4')) {
    ++folderTabLoads;
    return reply({success: true, tab_id: 'folder4', tab_html: SECURITY_TAB, button_html: ''});
  }
  return reply({});
};
${inlineScriptSafe(readAdminDeliverySource())}
selectTile = () => {};
loadSensorValues = () => Promise.resolve(false);
(async () => { try {
  const check = (value, message) => { if (!value) throw Error(message + '\\n' + log.join('\\n')); };
  initTileTabs();
  tileDataLoadedTabs.add('folder0');
  tilesData.folder0 = HOME.map(t => (t.type === 4 && [1, 2].includes(t.navigate_target)) ? {...t, layout_hidden: true} : {...t});
  tilesData.folder0.forEach((t, i) => renderTileFromData('folder0', i, t, {}));
  layoutTiles('folder0', tilesData.folder0);
  enableTileDrag('folder0');
  enablePageFields();
  // The page behind the window keeps its size (user 2026-10-13: the window
  // laid Home's grid out with its own sizes before taking it, the page's
  // grid grew and squeezed the rest).
  const pageGrid = getTileGrid('folder0');
  const pageSize = pageGrid.offsetWidth + 'x' + pageGrid.offsetHeight;
  const pageStyle = pageGrid.getAttribute('style');
  await openLayoutWindow();
  {
    const holder = document.querySelector('#tab-tiles-folder0 .tile-grid-scroll');
    const placeholder = holder && Array.from(holder.children).find(el => !el.classList.contains('tile-grid'));
    const kept = placeholder ? placeholder.offsetWidth + 'x' + placeholder.offsetHeight : 'none';
    if (kept !== pageSize) throw Error('The page keeps the grid\\'s room: ' + kept + ' / ' + pageSize);
  }
  await wait(50);
  const grid = getTileGrid('folder0');
  const stage = document.querySelector('.setup-stage');
  const box = el => el.getBoundingClientRect();
  const at = el => ({clientX: box(el).left + 20, clientY: box(el).top + 20});
  const metric = name => parseFloat(getComputedStyle(grid).getPropertyValue(name)) || 0;
  const placePoint = place => ({
    clientX: box(grid).left + grid.clientLeft + parseFloat(getComputedStyle(grid).paddingLeft) + place.col * (metric('--preview-cell-w') + metric('--preview-gap')) + 20,
    clientY: box(grid).top + grid.clientTop + parseFloat(getComputedStyle(grid).paddingTop) + place.row * (metric('--preview-cell-h') + metric('--preview-gap')) + 20});
  const fieldPoint = slot => placePoint(pageFieldPlaces(grid).pages[slot]);
  const settingsPoint = () => placePoint(pageFieldPlaces(grid).settings);
  const tileOf = folder => document.getElementById('folder0-tile-' + layoutHomeFolderIndex(folder));
  const settingsTile = () => document.getElementById('folder0-tile-' + layoutSettingsIndex());
  const settingsFree = () => grid.querySelector(':scope > .page-field.settings-field');
  const inSettingsField = el => {
    const want = settingsPoint(), r = box(el);
    return el.classList.contains('page-field-tile') && Math.abs(r.left + 20 - want.clientX) < 1 && Math.abs(r.top + 20 - want.clientY) < 1;
  };
  const inField = (el, slot) => {
    const want = fieldPoint(slot), r = box(el);
    return el.classList.contains('page-field-tile') && Math.abs(r.left + 20 - want.clientX) < 1 && Math.abs(r.top + 20 - want.clientY) < 1;
  };
  const slots = () => layoutWindow.pageSlots.join();
  const drag = (source, point, expectValid = true) => {
    const transfer = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', {bubbles:true,cancelable:true,dataTransfer:transfer,...at(source)}));
    grid.dispatchEvent(new DragEvent('dragover', {bubbles:true,cancelable:true,dataTransfer:transfer,...point}));
    const valid = !!grid.querySelector('.tile-drop-placeholder.show:not(.invalid)');
    check(valid === expectValid, 'The placeholder is ' + (expectValid ? 'valid' : 'invalid') + ' for ' + source.id);
    grid.dispatchEvent(new DragEvent('drop', {bubbles:true,cancelable:true,dataTransfer:transfer,...point}));
    source.dispatchEvent(new DragEvent('dragend', {bubbles:true,dataTransfer:transfer}));
  };

  // The fields in the window's area, the pages' own tiles in them.
  check(grid.classList.contains('setup-grid') && grid.classList.contains('has-page-fields'), 'The window shows the fields');
  check(grid.querySelectorAll(':scope > .page-field:not(.settings-field)').length === 5, 'Five page fields');
  check(pageFieldPlaces(grid).settings && settingsFree() && getComputedStyle(settingsFree()).display !== 'none',
        'The Settings field in the window, free: Settings is on the screen in this layout');
  check(getComputedStyle(grid.querySelector('#settingsHiddenSlot')).display === 'none', 'The parking slot of the editor stays hidden');
  check(!settingsTile().classList.contains('page-field-tile') && settingsTile().dataset.col === '5', 'Settings at its place');
  check(!document.querySelector('.setup-pages, .page-slot'), 'No page row of its own');
  check(inField(tileOf(1), 0) && inField(tileOf(2), 2), 'The pages stand in their fields');
  check(!tileOf(1).classList.contains('setup-red') && !tileOf(1).classList.contains('setup-parked'), 'A page is never red');
  check(grid.querySelector('.setup-flag.ok[data-for="' + tileOf(1).id + '"]'), 'A page has the green tick');
  check(document.querySelector('.setup-save').disabled, 'Nothing to save at the start');
  {
    const field = box(grid.querySelector(':scope > .page-field[data-slot="1"]')), cell = box(tileOf(3));
    check(Math.abs(field.width - cell.width) < 0.5 && Math.abs(field.height - cell.height) < 0.5,
          'A field is a tile\\'s size: ' + field.width + 'x' + field.height + ' / ' + cell.width + 'x' + cell.height + ' ' + tileOf(3).className);
    const g = box(grid), s = box(stage);
    check(g.right <= s.right + 1 && g.bottom <= s.bottom + 1 && box(grid.querySelector(':scope > .page-field[data-slot="1"]')).right <= s.right + 1,
          'The fields fit the window: grid ' + Math.round(g.right) + ' stage ' + Math.round(s.right));
    const area = getComputedStyle(grid, '::before');
    check(parseFloat(area.right) > 0 && area.borderTopStyle === 'dashed', 'The area is drawn beside the fields\\' room only');
  }
  const stageWidth = stage.style.width, gridWidth = grid.offsetWidth;

  // A Home folder onto a free field: a page in the window only.
  drag(tileOf(3), fieldPoint(1));
  check(slots() === '1,3,2,0,0' && inField(tileOf(3), 1), 'Climate is a page in field 2: ' + slots());
  check(!posts.length, 'Nothing reaches the panel before Speichern');
  check(!document.querySelector('.setup-save').disabled, 'The pages are to be saved');
  // A page onto the area: a folder tile again, one cell where it is dropped.
  drag(tileOf(2), placePoint({col: 3, row: 1}));
  check(slots() === '1,3,0,0,0', 'MISC left the fields: ' + slots());
  const misc = tileOf(2);
  check(!misc.classList.contains('page-field-tile') && misc.dataset.col === '3' && misc.dataset.row === '1' &&
        misc.dataset.spanW === '1' && misc.dataset.spanH === '1', 'MISC is one cell at the dropped spot');
  // A page onto another one: they swap.
  drag(tileOf(1), fieldPoint(1));
  check(slots() === '3,1,0,0,0' && inField(tileOf(1), 1) && inField(tileOf(3), 0), 'Lighting and Climate swapped: ' + slots());
  // The Settings field takes the Settings tile only: parked in this layout.
  drag(tileOf(4), settingsPoint(), false);
  check(slots() === '3,1,0,0,0' && !tileOf(4).classList.contains('page-field-tile'), 'Security stays on the screen');
  drag(settingsTile(), settingsPoint());
  check(layoutWindow.settingsParked.bar && inSettingsField(settingsTile()) && getComputedStyle(settingsFree()).display === 'none',
        'Settings parked in this layout, in its field');
  check(!settingsTile().classList.contains('setup-red'), 'A parked Settings tile is never red');
  // Out again onto the screen: placed where it is dropped.
  drag(settingsTile(), placePoint({col: 4, row: 3}));
  check(!layoutWindow.settingsParked.bar && !settingsTile().classList.contains('page-field-tile') &&
        settingsTile().dataset.col === '4' && settingsTile().dataset.row === '3', 'Settings back on the screen at the dropped spot');
  drag(settingsTile(), settingsPoint());
  check(layoutWindow.settingsParked.bar && inSettingsField(settingsTile()), 'Parked again');

  // A folder whose page is not loaded yet takes part, its page loads only
  // when its tab shows (user 2026-10-13: opening loaded every folder's page
  // one after the other).
  check(folderTabLoads === 0 && document.querySelector('.setup-tab[data-tab="folder4"]')?.textContent.includes('Security'),
        'Every folder has its tab without loading its page: ' + folderTabLoads);
  await mountLayoutTab('folder4');
  check(folderTabLoads === 1 && document.getElementById('tab-tiles-folder4') &&
        getTileGrid('folder4')?.classList.contains('setup-grid'), 'Its page loads when its tab shows');
  await mountLayoutTab('folder0');

  // Another page in the window: Home's grid goes back as the page had it.
  await mountLayoutTab('folder1');
  check(pageGrid.getAttribute('style') === pageStyle && pageGrid.classList.contains('has-page-fields') &&
        !pageGrid.classList.contains('setup-grid'), 'Home\\'s grid behind the window as the page had it');
  await mountLayoutTab('folder0');
  check(inField(tileOf(3), 0) && inField(tileOf(1), 1), 'Back on Home the pages stand in their fields');

  // The classic layout: no page fields, the Settings field alone, their
  // room kept; Settings is not parked there.
  await loadLayoutWindow('classic', '');
  check(grid.classList.contains('has-page-fields') &&
        getComputedStyle(grid.querySelector(':scope > .page-field[data-slot="0"]')).display === 'none' &&
        getComputedStyle(grid.querySelector(':scope > .page-fields-label')).display === 'none',
        'No page fields in the classic layout');
  check(!layoutWindow.settingsParked.classic && getComputedStyle(settingsFree()).display !== 'none' &&
        !settingsTile().classList.contains('page-field-tile') && settingsTile().style.display !== 'none',
        'Classic: the Settings field free, Settings on the screen');
  check(stage.style.width === stageWidth && Math.abs(grid.offsetWidth - gridWidth) < 2, 'The window keeps its size: ' + grid.offsetWidth + ' / ' + gridWidth);
  check(!tileOf(3).classList.contains('page-field-tile') && tileOf(3).style.display !== 'none', 'Classic shows every folder');
  // Stored with Settings parked: in its field.
  await loadLayoutWindow('portrait', '');
  check(layoutWindow.settingsParked.portrait && inSettingsField(settingsTile()), 'Upright: Settings parked as stored');
  await loadLayoutWindow('bar', '');
  check(slots() === '3,1,0,0,0' && inField(tileOf(3), 0) && inField(tileOf(1), 1), 'The pages are kept back in the bar layout');
  check(layoutWindow.settingsParked.bar && inSettingsField(settingsTile()), 'Settings still parked in the bar layout');

  // "Speichern": the pages with the places in one request.
  await saveLayoutWindow();
  const sent = posts.find(([url]) => url === 'api/layouts');
  check(sent && !posts.some(([url]) => url === 'api/pages'), 'One request to /api/layouts');
  const body = JSON.parse(sent[1]);
  check(JSON.stringify(body.pages) === '[3,1]', 'The pages: ' + JSON.stringify(body.pages));
  check(!body.folders['0'][101] && !body.folders['0'][103] && JSON.stringify(body.folders['0'][102]) === '[3,1,1,1]',
        'No place for a page, MISC at its spot: ' + JSON.stringify(body.folders['0']));
  check(body.settings_parked === true && !body.folders['0'][108], 'Settings parked in this layout, no place: ' + JSON.stringify(body));
  await closeLayoutWindow();
  check(pageGrid.offsetWidth + 'x' + pageGrid.offsetHeight === pageSize, 'The editor\\'s grid keeps its size after the window');
  check(pageSlotsElement().dataset.pages === '3,1', 'The editor takes the saved pages: ' + pageSlotsElement().dataset.pages);
  check(getTileGrid('folder0').classList.contains('has-page-fields') && !getTileGrid('folder0').classList.contains('setup-grid'),
        'The editor shows its fields again');
  check(!log.some(line => line.startsWith('ERR')), 'No script error');
  document.body.dataset.result = 'pass';
} catch (error) {
  document.body.dataset.result = 'fail'; document.getElementById('result').textContent = error.stack;
}})();
</script></body></html>`;

try {
  runDomHarness({label: 'Layout window fields', html, tmpPrefix: 'hometiles-window-fields-', extraArgs: ['--virtual-time-budget=15000', '--window-size=1500,1000']});
} catch (error) {
  throw Error(error.message.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || error.message.slice(0, 1500));
}
// A new tile learns its stable ID from the save at once (user 2026-10-13: a
// new folder showed red in the window's storage, looked up without its ID).
const save = readRepoFile('src/web/server/handlers/web_admin_tiles.cpp');
if (!/if \(saved_grid\.tiles\[index\]\.type != TILE_EMPTY\) \{\s*response \+= ",\\"view_id\\":";\s*response \+= String\(saved_grid\.tiles\[index\]\.view_id\);/.test(save)) {
  throw Error('The tile save answers with the tile\'s ID');
}
if (!/if \(data\.view_id !== undefined && tilesData\[tab\] && tilesData\[tab\]\[tileIndex\] &&[\s\S]{0,120}tilesData\[tab\]\[tileIndex\]\.view_id = Number\(data\.view_id\) \|\| 0;/
    .test(readRepoFile('src/web/admin/tiles/autosave.js'))) {
  throw Error('The editor keeps a new tile\'s ID');
}
console.log('Layout window fields: pages in Home\'s fields, in, out, swap, Settings parked per layout, classic keeps the room, saved in one go');
