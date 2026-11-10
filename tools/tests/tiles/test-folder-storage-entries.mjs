// A folder's tile list holds the classic cells plus entries for the layouts'
// storage (src/tiles/config/grid_slots.h), so tiles kept in a storage never
// take the entry a free cell needs. User 2026-10-16 (4B "Beleuchtung"): on
// the 3x3 head bar screen 8 tiles, 7 in the storage and the Back tile used
// all 16 entries of the 4x4 list; the free top-left cell took no new tile.
// Checks: the list size of every profile, files from before still read, the
// legacy migrations keep their size, no folder lies on a task stack, and the
// real editor offers that free cell once the list has its storage entries.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {extractDeliveredFunction, inlineScriptSafe, readRepoFile} from '../../lib/admin-source.mjs';
import {cppFunctionDefinitions} from '../../lib/cpp-source.mjs';
import {runDomHarness} from '../../lib/headless-dom.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

// --- Firmware contract (text) ---------------------------------------------
const header = read('src/tiles/config/tile_config.h');
assert.match(header, /static constexpr size_t GRID_CELLS = static_cast<size_t>\(GRID_COLS\) \* GRID_ROWS;/);
assert.match(header, /static constexpr size_t TILES_PER_GRID = grid_slots::capacity\(GRID_CELLS\);/);
const config = read('src/tiles/config/tile_config.cpp');
const functions = cppFunctionDefinitions(config);
const named = (f, name) => f.name === name || f.name.endsWith('::' + name);
const body = name => {
  const found = functions.filter(f => named(f, name));
  assert.ok(found.length, `${name} exists`);
  return found.map(f => f.source).join('\n');
};
// A file from before reads as it is, the rest of the list stays empty.
const reader = body('readPackedGridFileV7');
assert.match(reader, /grid_slots::readableQuarters\(/);
assert.match(reader, /LEGACY_QUARTERS_PER_GRID/);
assert.match(reader, /for \(size_t q = quarters; q < count; \+\+q\)/, 'missing blocks are filled as empty');
// The V6 and NVS migrations only ever find one entry per cell.
for (const name of ['loadGrid', 'saveGrid']) {
  for (const f of functions.filter(fn => named(fn, name) && /const char\* prefix/.test(fn.source.split('{')[0]))) {
    assert.doesNotMatch(f.source.replace(/LEGACY_QUARTERS_PER_GRID/g, ''), /QUARTERS_PER_GRID/,
      `${name}(prefix) keeps the legacy size`);
  }
}
const folderLoad = functions.find(f => named(f, 'loadGrid') && /uint16_t folder_id/.test(f.source.split('{')[0]));
assert.match(folderLoad.source, /allocPackedGridScratch<PackedQuarterGridV6>\(LEGACY_QUARTERS_PER_GRID/);
// Empty entries behind the cells default onto the grid.
assert.match(body('initGridDefaults'), /grid_slots::defaultCell\(i, GRID_CELLS\)/);

// No whole folder on a task stack (64 tiles are about 16 KB; the loop task
// has 16 KB): every function-local grid comes from makeTileGridScratch().
function sources(dir) {
  return fs.readdirSync(path.join(root, dir), {withFileTypes: true}).flatMap(entry => {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sources(rel);
    return /\.(cpp|ino)$/.test(entry.name) ? [rel] : [];
  });
}
for (const rel of [...sources('src'), 'HomeTiles.ino']) {
  const text = read(rel);
  if (!text.includes('TileGridConfig')) continue;
  for (const f of cppFunctionDefinitions(text)) {
    const local = f.body.match(/(^|[;{}\n]\s*)(static\s+)?TileGridConfig\s+[A-Za-z_]\w*\s*(\{\s*\}|;|=)/);
    assert.ok(!local || local[2], `${rel}: ${f.name} keeps a whole folder on the stack`);
  }
}

// --- grid_slots.h on the host ---------------------------------------------
function findCompiler(candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    const check = spawnSync(candidate, ['--version'], {encoding: 'utf8'});
    if (!check.error && check.status === 0) return candidate;
  }
  return null;
}
const cxx = findCompiler([process.env.CXX, 'clang++', 'g++', 'c++']);
if (!cxx) {
  console.log('SKIP: folder storage entries need a host C++ compiler (text contract checked)');
  process.exit(0);
}
const profiles = [];
for (const dir of fs.readdirSync(path.join(root, 'src/devices'), {withFileTypes: true})) {
  if (!dir.isDirectory()) continue;
  for (const file of fs.readdirSync(path.join(root, 'src/devices', dir.name))) {
    if (!file.endsWith('.h')) continue;
    const match = read(`src/devices/${dir.name}/${file}`).match(
      /Device::Profile kProfile\{\s*"([^"]+)",\s*(?:"[^"]+"|\w+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),/);
    if (match) profiles.push({name: match[1], cells: Number(match[4]) * Number(match[5])});
  }
}
assert.ok(profiles.length >= 17, `found ${profiles.length} profiles`);
const out = path.join(root, 'build/tests/folder-storage-entries');
fs.mkdirSync(out, {recursive: true});
const program = `#include "src/tiles/config/grid_slots.h"
#include <cstdio>
#include <cassert>
int main() {
  using namespace grid_slots;
  // Files: the full list, or exactly a file from before (16 cells: 4 blocks
  // of 964 bytes); any other size is damaged.
  assert(readableQuarters(16 * 964, 964, 16, 4) == 16);
  assert(readableQuarters(17 * 964, 964, 16, 4) == 16);
  assert(readableQuarters(4 * 964, 964, 16, 4) == 4);
  assert(readableQuarters(4 * 964 + 1, 964, 16, 4) == 0);
  assert(readableQuarters(5 * 964, 964, 16, 4) == 0);
  assert(readableQuarters(0, 964, 16, 4) == 0);
  assert(readableQuarters(4 * 964, 964, 4, 4) == 4);
  assert(defaultCell(0, 16) == 0 && defaultCell(15, 16) == 15 && defaultCell(16, 16) == 0 &&
         defaultCell(31, 16) == 15);
${profiles.map(p => `  std::printf("${p.name} %u\\n", static_cast<unsigned>(capacity(${p.cells})));`).join('\n')}
  return 0;
}
`;
const cpp = path.join(out, 'slots.cpp');
const exe = path.join(out, process.platform === 'win32' ? 'slots.exe' : 'slots');
fs.writeFileSync(cpp, program);
const build = spawnSync(cxx, ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-I', root, cpp, '-o', exe], {encoding: 'utf8'});
assert.equal(build.status, 0, `grid_slots test did not compile:\n${build.stdout}${build.stderr}`);
const run = spawnSync(exe, [], {encoding: 'utf8'});
assert.equal(run.status, 0, `grid_slots test failed:\n${run.stdout}${run.stderr}`);
const capacity = Object.fromEntries(run.stdout.trim().split(/\r?\n/).map(line => line.split(' ')).map(([n, c]) => [n, Number(c)]));
for (const {name, cells} of profiles) {
  const n = capacity[name];
  // The 64-bit switch and binary sensor update masks bound the list.
  assert.ok(n <= 64, `${name}: ${n} entries fit the 64-bit update masks`);
  assert.equal(n, Math.min(cells * 2, 64), `${name}: cells ${cells}, list ${n}`);
  assert.ok(n - cells >= Math.min(cells, 64 - cells), `${name}: the storage has its own entries`);
}

// --- The 4B case in the real editor -----------------------------------------
const list4b = capacity.waveshare_4b;
assert.equal(list4b, 32, 'the 4B list: 16 cells plus 16 storage entries');
const helpers = ['clampInt','clampHalf','isCompactSensorType','isEditableValueType','supportsHalfSize','supportedTileLayout',
  'normalizeLayoutForTileType','normalizeTileLayout','constrainLayoutToTab','setGridItemPosition',
  'setTileGridPosition','layoutTiles','headBarLayout','placeCols','placeRows','tileTakesRoom','emptyOccupancy','markOccupied',
  'slotFits','freeSlotNear','pointerGridPoint','firstFreeSlot','occupiedFromGrid','freeSlotElement','getTileElementLayout',
  'minimumTileSize','canPlaceTileLayout','canPlaceGridLayout','rectsOverlap','getTileLayoutFromData','enableFreeSlotHover'].map(extractDeliveredFunction).join('\n');
// "Beleuchtung" as exported: the Back tile (classic top left, no head bar
// place), 8 tiles on the 3x3 screen, 7 in the storage.
const shown = [[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]];
const folder = [{type: 8, col: 0, row: 0, span_w: 1, span_h: 1, layout_hidden: true},
  ...shown.map(([col, row]) => ({type: 5, col, row, span_w: 1, span_h: 1})),
  ...Array.from({length: 7}, () => ({type: 5, col: 0, row: 0, span_w: 1, span_h: 1, layout_hidden: true}))];
assert.equal(folder.length, 16);
const html = `<!doctype html><html><head><style>${readRepoFile('src/web/assets/admin.css')}
:root{--grid-cols:3;--grid-rows:3;--preview-cell-w:100px;--preview-cell-h:100px;--preview-gap:12px;--preview-pad:4px;--tile-radius:16px;}</style></head><body>
<div id="tab-tiles-test"><div class="tile-grid"></div></div><pre id="result"></pre><script>
${inlineScriptSafe(helpers)}
const GRID_COLS=4,GRID_ROWS=4,HEAD_BAR=true,GRID_SHOWN_COLS=3,GRID_SHOWN_ROWS=3,MEDIA_TILE_TYPE=15,MEDIA_TILE_MIN_SPAN=2,
  MEDIA_TILE_MAX_SPAN=3,FREE_SLOT_SIZES=[[1,1],[1,.5]];
let currentTileTab='test',currentTileIndex=-1,dragSource=null,resizeState=null,newTileSpot=null;
const TILES_PER_GRID=${list4b},notes=[];
function showNotification(text,ok){notes.push({text,ok});}
function tf(key,r){return key+' '+r.n+'/'+r.max;}
function selectTile(){}
function firstAllowedGridRow(){return 0;}
function getTileGrid(){return document.querySelector('#tab-tiles-test .tile-grid');}
function getTilesData(){return window.testTiles||[];}
function getTileGridMetrics(){const rect=getTileGrid().getBoundingClientRect();return {rect,padLeft:4,padTop:4,cellW:100,cellH:100,gapX:12,gapY:12};}
const check=(v,m)=>{if(!v)throw Error(m);};
const folder=${JSON.stringify(folder)};
function render(count,storedExtra=0){
  const grid=getTileGrid();
  const extra=Array.from({length:storedExtra},()=>({type:5,col:0,row:0,span_w:1,span_h:1,layout_hidden:true}));
  const tiles=[...folder,...extra,...Array.from({length:count-folder.length-storedExtra},()=>({type:0}))];
  grid.innerHTML=tiles.map((t,i)=>'<div class="tile '+(t.type?'filled':'empty')+'" id="test-tile-'+i+'" data-index="'+i+'" data-type="'+t.type+'"></div>').join('');
  window.testTiles=tiles;
  layoutTiles('test',tiles);
  return [...grid.querySelectorAll('.tile.empty')].filter(el=>el.style.display!=='none');
}
try{
  // Before: 16 entries, all used, so no free slot anywhere (the bug).
  check(render(16).length===0,'With 16 of 16 entries used no free slot can be offered');
  // Now: the storage has its own entries; the free cell top left takes a tile.
  const free=render(${list4b});
  check(free.length===1,'One free slot is offered, got '+free.length+' '+free.map(el=>JSON.stringify(getTileElementLayout('test',Number(el.dataset.index)))).join(' '));
  const at=getTileElementLayout('test',Number(free[0].dataset.index));
  check(at.col===0&&at.row===0&&at.span_w===1&&at.span_h===1,'The free slot rests on the empty top-left cell '+JSON.stringify(at));
  check(!occupiedFromGrid('test',getTileGrid(),free[0])[0][0],'Neither the Back tile nor the storage tiles take that cell');
  // A folder whose every entry is used: the free cell keeps the hand and a
  // click says the folder is full.
  check(render(TILES_PER_GRID,TILES_PER_GRID-folder.length).length===0,'Every entry used: no free slot');
  enableFreeSlotHover('test');
  const r=getTileGrid().getBoundingClientRect();
  getTileGrid().dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse',clientX:r.left+4+50,clientY:r.top+4+50}));
  const marker=getTileGrid().querySelector('.folder-full-slot.shown');
  check(marker,'The full folder still marks the free cell');
  check(getComputedStyle(marker).cursor==='pointer','with the hand');
  const m=marker.getBoundingClientRect();
  check(Math.abs(m.left-(r.left+4))<2&&Math.abs(m.top-(r.top+4))<2,'on the top-left cell');
  document.elementFromPoint(m.left+m.width/2,m.top+m.height/2).click();
  check(notes.length===1&&notes[0].text==='folderFull 32/32'&&notes[0].ok===false,'A click says the folder is full '+JSON.stringify(notes));
  check(!getTileGrid().querySelector('.tile[data-selected="1"]'),'and selects no tile');
  document.body.dataset.result='pass';
}catch(error){document.body.dataset.result='fail';document.getElementById('result').textContent=error.stack;}
</script></body></html>`;
runDomHarness({label: 'Folder storage entries (4B top-left cell)', html, tmpPrefix: 'hometiles-storage-entries-'});
