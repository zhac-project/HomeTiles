// Home's page fields and Settings field (head bar layouts, user 2026-10-13:
// the page row beside the grid was a second system with its own sizes,
// frames and drags) with the delivered Web Admin code and a simulated
// device: the fields are cells of Home's own grid, the tiles' size; a Home
// folder dropped on a free field becomes a page (its own tile stands there),
// a locked folder asks once before its PIN goes, pages move and swap
// between fields, a page dragged onto the screen is a folder tile again as
// one cell at the dropped spot, a sixth page sends nothing, a tap picks a
// page like any tile, and the Settings tile parks in its field. A folder's
// tab above the page and its page's head follow its tile's title and icon
// while typing, a save loads no folder page from the panel (user
// 2026-10-14: the tab waited for both).
import {readAdminDeliverySource, readRepoFile, inlineScriptSafe} from '../../lib/admin-source.mjs';
import {runDomHarness} from '../../lib/headless-dom.mjs';

const TILES = 24;
const head = (folder, button) => `<div class="head-bar-preview" aria-hidden="true"><span class="head-disc"><i class="mdi mdi-home"></i></span>` +
  `<span class="head-title">${folder}</span><span class="head-time">12:00</span>` +
  `<span class="head-button ${button}"><i class="mdi mdi-${button ? 'cog' : 'window-close'}"></i></span></div>`;
const html = `<!doctype html><html><head><style>
${readRepoFile('src/web/assets/admin.css')}
:root { --grid-cols:6; --grid-rows:4; --preview-cell-w:100px; --preview-cell-h:80px; --preview-gap:10px; --preview-pad:10px; }
</style></head><body>
<div class="wrapper with-page-fields"><div id="tab-tiles-folder0" class="tile-tab tab-content active" data-folder-id="0"><div class="tile-editor"><div class="tile-editor-main">
<div class="tile-grid-scroll"><div class="tile-grid head-bar-grid" id="folder0Grid">${head('Home', 'head-gear')}
${Array.from({length: TILES}, (_, i) => `<div class="tile empty" id="folder0-tile-${i}" data-index="${i}" data-type="0" draggable="true" onclick="selectTile(parseInt(this.dataset.index), 'folder0')"></div>`).join('')}
</div></div>
<div id="pageSlots" class="page-fields" data-pages=""><div class="page-fields-label">Pages</div>${
  Array.from({length: 5}, (_, i) => `<div class="page-field" data-slot="${i}"></div>`).join('')}<div id="settingsHiddenSlot" class="tile-grid settings-hidden-slot" data-in-grid="1"><div id="settingsHiddenTile" class="tile settings-hidden-tile empty" data-hidden="0"></div></div></div>
</div></div></div></div>
<div id="tab-tiles-folder1" class="tile-tab tab-content" data-folder-id="1" data-tab-id="folder1"><div class="tile-grid head-bar-grid" id="folder1Grid">${head('Lights', '')}</div></div>
<div class="tab-nav"><div id="folderTabs">${[[1, 'Lights', 'lightbulb'], [3, 'Alarm', 'shield']].map(([id, name, icon]) =>
  `<button class="tab-btn folder-tab-btn" type="button" data-folder-id="${id}" data-folder-parent="0" data-tab-id="folder${id}" data-folder-name="${name}" data-folder-icon="${icon}"><span class="tab-disc"><i class="mdi mdi-${icon}"></i></span><span class="tab-label">${name}</span></button>`).join('')}</div></div>
<div id="folder0Settings" class="tile-settings"><div class="tile-specific-settings">
<select id="folder0_tile_type"><option value="0">Empty</option><option value="4">Folder</option><option value="7">Settings</option></select>
<textarea id="folder0_tile_title"></textarea><input id="folder0_tile_icon"><input type="color" id="folder0_tile_color">
${['col','row','span_w','span_h'].map(name => `<input id="folder0_tile_${name}" type="number" value="1">`).join('')}
<input type="checkbox" id="folder0_settings_pin_enabled"><input type="checkbox" id="folder0_settings_tile_hidden">
<input type="checkbox" id="folder0_settings_swipe_enabled"><select id="folder0_settings_reveal_edge"><option value="0">Top</option></select>
</div></div><pre id="result">running</pre><script>
const nativeListen = document.addEventListener.bind(document);
document.addEventListener = (name, ...args) => { if (name !== 'DOMContentLoaded') nativeListen(name, ...args); };
const APP_I18N = {}, CLIMATE_I18N = {}, BINARY_SENSOR_I18N = {};
const GRID_COLS = 7, GRID_ROWS = 5, GRID_SHOWN_COLS = 6, GRID_SHOWN_ROWS = 4, HEAD_BAR = true;
const TILES_PER_GRID = ${TILES}, ADMIN_WEB_SESSION_TOKEN = 'test', ACTIVE_LAYOUT = 'bar';
const TILE_TYPE_REGISTRY = {
  4: {label:'Folder',css:'navigate',fields:'navigate',preview:'none',load:'loadNavigateFields',reset:'resetNavigateFields'},
  7: {label:'Settings',css:'navigate',fields:'settings_access',preview:'none',locked:true,reset:'resetNavigateFields'}
};
const TILE_TABS = [], TAB_BY_FOLDER = {}, FOLDER_BY_TAB = {}, SCREENSAVER_FOLDER_ID = 65535;
const SCREENSAVER_TILE_DEFAULT_OPACITY = 0, SCREENSAVER_TILE_DEFAULT_COLOR = '#000000';
const MEDIA_TILE_MIN_SPAN = 2, MEDIA_TILE_MAX_SPAN = 3, MEDIA_TILE_TYPE = 15;
// The simulated device: Home with folders (3 locked) and the Settings tile.
const empty = () => ({type:0});
const device = Array.from({length: ${TILES}}, empty);
device[0] = {type:4,title:'Lights',icon_name:'lightbulb',navigate_target:1,col:0,row:0,span_w:1,span_h:1};
device[1] = {type:4,title:'Climate',icon_name:'thermostat',navigate_target:2,col:1,row:0,span_w:1,span_h:1};
device[2] = {type:4,title:'Alarm',icon_name:'shield',navigate_target:3,col:2,row:0,span_w:1,span_h:1,folder_pin_enabled:true};
[11, 12, 13, 14, 15].forEach((folder, i) => {
  device[3 + i] = {type:4,title:'F' + folder,icon_name:'folder',navigate_target:folder,col:(3 + i) % 6,row:Math.floor((3 + i) / 6),span_w:1,span_h:1};
});
device[10] = {type:7,title:'Settings',icon_name:'cog',col:5,row:3,span_w:1,span_h:1};
const locked = new Set([3]);
let pages = [];
const log = [];
window.addEventListener('error', event => log.push('ERR ' + event.message));
let confirms = 0;
window.confirm = () => { ++confirms; return true; };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
window.fetch = async (url, options) => {
  if (options?.method === 'POST') {
    const body = Object.fromEntries(new URLSearchParams(options.body));
    log.push(url + ' ' + JSON.stringify(body));
    await wait(20);
    if (url === 'mqtt') {
      if (body.settings_tile_hidden === '1') device[10] = empty();
      return {ok:true, status:200, json:async()=>({ok:true, settings_tile_index:-1})};
    }
    if (url !== 'api/pages') return {ok:true, status:200, json:async()=>({success:true})};
    const wanted = body.pages ? body.pages.split(',').map(Number) : [];
    const fresh = wanted.filter(id => !pages.includes(id));
    const lockedNew = fresh.find(id => locked.has(id));
    if (lockedNew && body.unlock !== '1') {
      return {ok:false, status:409, json:async()=>({success:false,error:'locked',folder:lockedNew})};
    }
    fresh.forEach(id => locked.delete(id));
    device.forEach(tile => {
      if (tile.type !== 4) return;
      tile.layout_hidden = wanted.includes(tile.navigate_target);
      // Back as one cell, like the device (/api/pages).
      if (Number(body.out) === tile.navigate_target) Object.assign(tile, {col: Number(body.col), row: Number(body.row), span_w: 1, span_h: 1});
    });
    pages = wanted;
    return {ok:true, status:200, json:async()=>({success:true})};
  }
  if (String(url).startsWith('api/folders/tab')) log.push('PAGE ' + url);
  if (String(url).startsWith('api/tiles?folder=0')) {
    await wait(10);
    return {ok:true, status:200, json:async()=>JSON.parse(JSON.stringify(device))};
  }
  return {ok:true, status:200, json:async()=>({})};
};
${inlineScriptSafe(readAdminDeliverySource())}
(async () => { try {
  const check = (value, message) => { if (!value) throw Error(message + '\\n' + log.join('\\n')); };
  const grid = getTileGrid('folder0');
  const box = el => el.getBoundingClientRect();
  const at = el => ({clientX: box(el).left + 20, clientY: box(el).top + 20});
  const metric = name => parseFloat(getComputedStyle(grid).getPropertyValue(name)) || 0;
  const placePoint = place => ({
    clientX: box(grid).left + grid.clientLeft + parseFloat(getComputedStyle(grid).paddingLeft) + place.col * (metric('--preview-cell-w') + metric('--preview-gap')) + 20,
    clientY: box(grid).top + grid.clientTop + parseFloat(getComputedStyle(grid).paddingTop) + place.row * (metric('--preview-cell-h') + metric('--preview-gap')) + 20});
  const fieldPlace = slot => slot === 'settings' ? pageFieldPlaces(grid).settings : pageFieldPlaces(grid).pages[slot];
  const fieldPoint = slot => placePoint(fieldPlace(slot));
  const cellPoint = (col, row) => placePoint({col, row});
  const tileOf = folder => document.getElementById('folder0-tile-' + homeFolderTileIndex(folder));
  const inField = (el, slot) => {
    const want = fieldPoint(slot), r = box(el);
    return el.classList.contains('page-field-tile') && Math.abs(r.left + 20 - want.clientX) < 1 && Math.abs(r.top + 20 - want.clientY) < 1;
  };
  const dots = tab => [...document.querySelectorAll('#tab-tiles-' + tab + ' .head-dots > i')].map(dot => dot.classList.contains('on') ? 'O' : 'o').join('');
  const settle = () => wait(300);
  initTileTabs();
  folderByTab.folder0 = 0;
  tileDataLoadedTabs.add('folder0');
  tilesData.folder0 = JSON.parse(JSON.stringify(device));
  tilesData.folder0.forEach((tile, i) => renderTileFromData('folder0', i, tile, {}));
  layoutTiles('folder0', tilesData.folder0);
  enableTileDrag('folder0');
  enableSettingsHiddenSlot();
  enablePageFields();
  check(grid.classList.contains('has-page-fields') && grid.querySelectorAll(':scope > .page-field').length === 5 &&
        grid.querySelector(':scope > #settingsHiddenSlot') && grid.querySelector(':scope > .page-fields-label'),
        'Five page fields, the Settings field and the word stand in Home\\'s grid');
  check(getTileGrid('folder0').id === 'folder0Grid', 'The editor still finds the Home grid first');
  // The fields' black box: one grid gap of black above, below and between
  // the fields (user 2026-10-14: the top was a pixel short, its line
  // inside); the word a little off the screen, the Settings field its own
  // word over it in the same line.
  {
    const cs = getComputedStyle(grid), after = getComputedStyle(grid, '::after');
    const originX = box(grid).left + grid.clientLeft, originY = box(grid).top + grid.clientTop;
    const gapPx = metric('--preview-gap'), cellH = metric('--preview-cell-h');
    const cellTop = place => originY + parseFloat(cs.paddingTop) + place.row * (cellH + gapPx);
    const cellLeft = place => originX + parseFloat(cs.paddingLeft) + place.col * (metric('--preview-cell-w') + gapPx);
    const boxTop = originY + parseFloat(after.top), boxBottom = boxTop + parseFloat(after.height);
    const first = fieldPlace(0), settingsPlace = fieldPlace('settings');
    const top = cellTop(first) - (boxTop + 1), bottom = (boxBottom - 1) - (cellTop(first) + cellH);
    check(Math.abs(top - gapPx) < 0.6 && Math.abs(bottom - gapPx) < 0.6, 'One gap of black above and below: ' + top + ' / ' + bottom);
    const pagesWord = grid.querySelector(':scope > .page-fields-label:not(.settings-label)');
    const settingsWord = grid.querySelector(':scope > .page-fields-label.settings-label');
    const screenBottom = originY + parseFloat(cs.paddingTop) + 4 * (cellH + gapPx) - gapPx + metric('--preview-pad');
    check(box(pagesWord).top - screenBottom >= 5 && boxTop - box(pagesWord).bottom >= 3,
          'The word off the screen and over the box: ' + (box(pagesWord).top - screenBottom) + ' / ' + (boxTop - box(pagesWord).bottom));
    check(settingsWord && !settingsWord.hidden && settingsWord.textContent === 'Settings' &&
          Math.abs(box(settingsWord).left - cellLeft(settingsPlace)) < 1 && Math.abs(box(settingsWord).top - box(pagesWord).top) < 0.5,
          'The Settings field has its word over it');
  }
  {
    const field = grid.querySelector(':scope > .page-field');
    const tile = tileOf(1);
    check(Math.abs(box(field).width - box(tile).width) < 0.5 && Math.abs(box(field).height - box(tile).height) < 0.5,
          'A field is exactly a tile\\'s size: ' + box(field).width + 'x' + box(field).height + ' / ' + box(tile).width + 'x' + box(tile).height);
  }
  check(!dots('folder0'), 'No dots without pages');

  // Drags the way the grid takes them: dragstart on the tile, dragover and
  // drop at a point of Home's grid.
  const drag = async (source, point, expectValid = true) => {
    const transfer = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', {bubbles:true,cancelable:true,dataTransfer:transfer,...at(source)}));
    const started = JSON.stringify(dragSource && {kind: dragSource.kind, index: dragSource.index}) + ' src=' + source.id + ' at=' + JSON.stringify(at(source));
    grid.dispatchEvent(new DragEvent('dragover', {bubbles:true,cancelable:true,dataTransfer:transfer,...point}));
    const valid = !!grid.querySelector('.tile-drop-placeholder.show:not(.invalid)');
    check(valid === expectValid, 'The placeholder is ' + (expectValid ? 'valid' : 'invalid') + ': ' +
          JSON.stringify(dragSource && {kind: dragSource.kind, index: dragSource.index, type: dragSource.type, folder: dragSource.folder}) + ' started ' + started);
    grid.dispatchEvent(new DragEvent('drop', {bubbles:true,cancelable:true,dataTransfer:transfer,...point}));
    source.dispatchEvent(new DragEvent('dragend', {bubbles:true,dataTransfer:transfer}));
  };

  // A folder becomes a page exactly where it is dropped (user 2026-10-12:
  // nothing moves up), its own tile in the field at once, before the device
  // answers; the dots skip the free places.
  await drag(tileOf(1), fieldPoint(3));
  check(inField(tileOf(1), 3) && !pages.length, 'The page stands in its field before the device has saved it');
  await settle();
  check(pages.join() === '0,0,0,1', 'Its place is kept, free places too: ' + pages.join());
  check(grid.querySelector(':scope > .page-field[data-slot="3"]').hidden, 'Its field\\'s frame is under the tile');
  {
    // Its stored place takes no room: the free slot can go there (user
    // 2026-10-13: the pages' old places blocked it, only half cells were left).
    const occupied = occupiedFromGrid('folder0', grid, null);
    check(!occupied[0][0] && !occupied[1][1], 'A page\\'s stored place is free for a new tile');
  }
  check(dots('folder0') === 'Oo' && dots('folder1') === 'oO', 'The dots skip the free places: ' + dots('folder0') + ' ' + dots('folder1'));
  check(document.querySelector('#tab-tiles-folder1 .head-button i').classList.contains('mdi-cog'), 'A page has the gear');

  // A locked folder asks once, then its PIN goes with the request.
  await drag(tileOf(3), fieldPoint(0));
  await settle();
  check(confirms === 1 && pages.join() === '3,0,0,1' && log.filter(line => line.startsWith('api/pages')).length === 2 &&
        log.some(line => line.includes('"unlock":"1"')), 'A locked folder asks before its PIN goes: ' + pages.join());
  check(dots('folder1') === 'ooO', 'The dots follow the places: ' + dots('folder1'));

  // A page onto a free field moves there; onto another page they swap.
  await drag(tileOf(1), fieldPoint(1));
  await settle();
  check(pages.join() === '3,1' && inField(tileOf(1), 1), 'A page moves to a free field: ' + pages.join());
  await drag(tileOf(3), fieldPoint(1));
  await settle();
  check(pages.join() === '1,3' && inField(tileOf(1), 0) && inField(tileOf(3), 1) && dots('folder1') === 'oOo',
        'Onto another page they swap: ' + pages.join());

  // A folder from the screen takes free fields only.
  {
    const posts = log.length;
    await drag(tileOf(11), fieldPoint(0), false);
    await settle();
    check(log.length === posts && pages.join() === '1,3', 'A page is no drop target for a folder from the screen');
  }

  // A page dragged onto the screen is a tile again where it was dropped; its
  // field stays free.
  await drag(tileOf(1), cellPoint(4, 2));
  await settle();
  check(pages.join() === '0,3' && log.at(-1).includes('"out":"1"') && log.at(-1).includes('"col":"4"') &&
        log.at(-1).includes('"row":"2"'), 'The page leaves at the dropped spot: ' + log.at(-1));
  check(!tileOf(1).classList.contains('page-field-tile') && Number(tileOf(1).dataset.col) === 4 &&
        !grid.querySelector(':scope > .page-field[data-slot="0"]').hidden && inField(tileOf(3), 1),
        'Its tile is back on the screen, its field free, the other page stays');
  check(document.querySelector('#tab-tiles-folder1 .head-button i').classList.contains('mdi-window-close') &&
        !dots('folder1'), 'A folder again: its X, no dots');

  // A folder in a field is one cell, and comes back as one (user 2026-10-12).
  {
    const index = homeFolderTileIndex(2);
    const tile = getTilesData('folder0')[index];
    Object.assign(tile, {col: 0, row: 3, span_w: 2, span_h: 0.5});
    Object.assign(device[1], {col: 0, row: 3, span_w: 2, span_h: 0.5});
    renderTileFromData('folder0', index, tile, {});
    layoutTiles('folder0', getTilesData('folder0'));
    await drag(tileOf(2), fieldPoint(0));
    await settle();
    check(pages.join() === '2,3' && inField(tileOf(2), 0) && !tileOf(2).classList.contains('sensor-half'),
          'The half-high folder is a page, one cell in its field: ' + pages.join() + ' ' + tileOf(2).className);
    await drag(tileOf(2), cellPoint(3, 3));
    const shown = getTilesData('folder0')[index];
    check(shown.span_w === 1 && shown.span_h === 1, 'At once as one cell: ' + shown.span_w + 'x' + shown.span_h);
    await settle();
    const back = getTilesData('folder0')[index];
    check(back.span_w === 1 && back.span_h === 1 && !back.layout_hidden,
          'One cell on the device too: ' + back.span_w + 'x' + back.span_h);
  }

  // Five pages: no free field, nothing is sent.
  {
    document.getElementById('pageSlots').dataset.pages = '3,11,12,13,14';
    pages = [3, 11, 12, 13, 14];
    [3, 11, 12, 13, 14].forEach(folder => { getTilesData('folder0')[homeFolderTileIndex(folder)].layout_hidden = true; });
    layoutTiles('folder0', getTilesData('folder0'));
    const posts = log.length;
    await drag(tileOf(1), fieldPoint(2), false);
    await settle();
    check(log.length === posts && !tileOf(1).classList.contains('page-field-tile'), 'A sixth page sends nothing');
  }

  // A tap on a page picks its folder tile like any tile, with the teal
  // selection on it; nothing is built again (the head's dots stay).
  {
    const shownDots = document.querySelector('#tab-tiles-folder0 .head-dots');
    tileOf(3).dispatchEvent(new MouseEvent('click', {bubbles:true}));
    await wait(100);
    check(currentTileTab === 'folder0' && currentTileIndex === homeFolderTileIndex(3) && tileOf(3).classList.contains('active') &&
          document.querySelector('#tab-tiles-folder0 .head-dots') === shownDots,
          'A tap on a page picks its folder: ' + [currentTileIndex, homeFolderTileIndex(3), tileOf(3).className].join(' '));
  }

  // The picked page stays in its field as one cell while it is edited, with
  // its stored place and size untouched (user 2026-10-13: a tap took it out
  // of its field onto its stored place, half high, with resize handles, and
  // other pages moved too).
  {
    const index = homeFolderTileIndex(3);
    Object.assign(getTilesData('folder0')[index], {col: 0, row: 1, span_w: 1, span_h: 0.5});
    const before = box(tileOf(3));
    selectTile(index, 'folder0');
    document.getElementById('folder0_tile_title').value = 'Alarm 2';
    updateTilePreview('folder0');
    updateLayoutFromInputs('folder0');
    const after = box(tileOf(3));
    check(tileOf(3).classList.contains('page-field-tile') && Math.abs(after.left - before.left) < 0.5 &&
          Math.abs(after.top - before.top) < 0.5 && Math.abs(after.height - box(tileOf(1)).height) < 0.5 &&
          !tileOf(3).classList.contains('sensor-compact'), 'The picked page stays in its field, one cell: ' + tileOf(3).className);
    const stored = getTilesData('folder0')[index];
    check(stored.span_h === 0.5 && stored.col === 0 && stored.row === 1, 'Its stored place and size stay: ' + JSON.stringify(stored));
    check([...tileOf(3).querySelectorAll('.tile-resize-handle')].every(handle => getComputedStyle(handle).display === 'none'),
          'No resize handles on a page');
    check([11, 12, 13, 14].every(folder => tileOf(folder).classList.contains('page-field-tile')), 'The other pages stay in their fields');
    // Its folder's tab above the page follows while typing (not loaded yet).
    const button = document.querySelector('.folder-tab-btn[data-folder-id="3"]');
    check(button.querySelector('.tab-label').textContent === 'Alarm 2' && button.dataset.folderName === 'Alarm 2',
          'The tab follows the title at once: ' + button.querySelector('.tab-label').textContent);
    document.getElementById('folder0_tile_icon').value = 'shield-home';
    updateTilePreview('folder0');
    check(button.querySelector('.tab-disc i').className === 'mdi mdi-shield-home', 'The tab follows the icon at once');
    // The save's answer loads no folder page from the panel for it.
    check(await ensureFolderTabUi(3, 'Alarm 2', 'shield-home') === true && !log.some(line => line.startsWith('PAGE')),
          'No folder page loaded for a name: ' + log.filter(line => line.startsWith('PAGE')).join());
    // A loaded folder page's head follows too.
    updateFolderTabUi(1, 'Licht', '');
    check(document.querySelector('#tab-tiles-folder1 .head-title').textContent === 'Licht' &&
          document.querySelector('#tab-tiles-folder1 .head-disc > i').className === 'mdi mdi-folder' &&
          document.querySelector('.folder-tab-btn[data-folder-id="1"] .tab-label').textContent === 'Licht',
          'A loaded page\\'s head and tab follow');
  }
  check(parseFloat(getComputedStyle(grid, '::after').height) > 0 &&
        getComputedStyle(grid, '::after').backgroundColor === 'rgb(0, 0, 0)', 'The fields lie on a black box like the screen');

  // The Settings tile parks in its field, like a tile dropped there.
  {
    const settings = document.getElementById('folder0-tile-10');
    await drag(settings, fieldPoint('settings'));
    await settle();
    check(log.some(line => line.startsWith('mqtt') && line.includes('"settings_tile_hidden":"1"')) &&
          document.getElementById('settingsHiddenSlot').classList.contains('has-tile') &&
          Number(getTilesData('folder0')[10]?.type || 0) === 0, 'Settings parks in its field');
    const slot = document.getElementById('settingsHiddenSlot');
    const want = fieldPoint('settings');
    check(Math.abs(box(slot).left + 20 - want.clientX) < 1 && Math.abs(box(slot).top + 20 - want.clientY) < 1 &&
          Math.abs(box(slot).width - box(tileOf(3)).width) < 0.5, 'The Settings field lies in its place, a tile\\'s size');
  }
  check(!log.some(line => line.startsWith('ERR')), 'No script error');
  document.body.dataset.result = 'pass';
} catch (error) {
  document.body.dataset.result = 'fail'; document.getElementById('result').textContent = error.stack;
}})();
</script></body></html>`;

try {
  runDomHarness({label: 'Page fields', html, tmpPrefix: 'hometiles-page-fields-', extraArgs: ['--virtual-time-budget=12000']});
} catch (error) {
  throw Error(error.message.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || error.message.slice(0, 1500));
}
// The panel keeps an edited page off Home (user 2026-10-13: a renamed page
// came back on Home in its old size): it stays hidden, so no place is
// written for it and the shown grid leaves it out; its stored place and size
// are kept and not checked against the shown tiles (an edit of its title was
// refused with "Tile overlaps").
{
  const tiles = readRepoFile('src/web/server/handlers/web_admin_tiles.cpp').replace(/\r\n/g, '\n');
  const save = tiles.slice(tiles.indexOf('void WebAdminServer::handleSaveTiles() {'), tiles.indexOf('void WebAdminServer::handleReorderTiles() {'));
  const decided = save.indexOf('const bool page_tile = !classic_places && !screensaver_grid && grid_layout::head_bar() &&');
  const parsed = save.indexOf('auto parse_geometry');
  if (decided < 0 || parsed < decided ||
      !/previous_tile\.type == TILE_FOLDER &&\s*type == TILE_FOLDER && tile_layouts::page_number\(getNavigateTargetId\(previous_tile\)\) > 0;/.test(save)) {
    throw Error('A page must be known before its geometry is read');
  }
  if (!/if \(!page_tile\) \{\s*auto parse_geometry[\s\S]*?tile\.col = col; tile\.row = row; tile\.span_w = span_w; tile\.span_h = span_h;\s*\}/.test(save)) {
    throw Error('An edited page must keep its stored place and size');
  }
  if (!save.includes('tile.layout_hidden = page_tile || (classic_places') ||
      !save.includes('if (tile.type != TILE_EMPTY && !page_tile) {')) {
    throw Error('An edited page must stay hidden and unchecked');
  }
  // A renamed folder's built page gets its head again at once.
  if (!/const bool folder_renamed = !screensaver_grid && tile\.type == TILE_FOLDER &&\s*\(previous_tile\.type != TILE_FOLDER \|\| previous_tile\.title != tile\.title \|\|\s*previous_tile\.icon_name != tile\.icon_name\);/.test(save) ||
      !/if \(folder_renamed\) tiles_rebuild_heads\(display_awake\);/.test(save)) {
    throw Error('A folder renamed by its tile must rebuild the heads');
  }
  const config = readRepoFile('src/tiles/config/tile_config.cpp');
  if (!config.includes('if (!tile.layout_hidden && tile.type != TILE_BACK) {\n      tile_layouts::set(active, folder_id, tile.view_id,') &&
      !config.includes('if (!tile.layout_hidden && tile.type != TILE_BACK) {\r\n      tile_layouts::set(active, folder_id, tile.view_id,')) {
    throw Error('A hidden tile must get no place in the active layout');
  }
}
console.log('Page fields: cells of Home\'s grid, places kept, PIN question, move and swap, out as one cell, five at most, Settings parks');
