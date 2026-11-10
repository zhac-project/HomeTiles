// The settings panel keeps its width beside a square screen's page fields
// (user 2026-10-13: on the Guition S3 it shrank to 312 px, "da ist ja noch
// etwas Platz"). Home's fields are cells of its grid beside the screen, so
// Home's editor column had an empty second column (24 px, meant for the old
// Settings slot) and the 1200 px page had no room left for the 390 px
// panel. Renders the real admin.css with the S3's head bar geometry (3 x 3,
// cells 146 x 122, gap 10, preview 109 px a cell) on Home and a folder.
import assert from 'node:assert/strict';
import {readRepoFile} from '../../lib/admin-source.mjs';
import {runDomHarness} from '../../lib/headless-dom.mjs';

const styles = readRepoFile('src/web/server/render/web_admin_styles.cpp');
const fieldsJs = readRepoFile('src/web/admin/tiles/page-fields.js');
// The page widens by what the fields need, by the fields' own room.
assert.match(fieldsJs, /return \{beside: true, w: 2 \* \(cellW \+ gap\) \+ gap, h: 0, fixedW: 14, fixedH: 0\};/,
  'The fields beside the screen: two cells, three gaps and 14 px');
assert.match(styles, /const double fields = 2\.0 \* \(GRID_CELL_W \+ GRID_GAP\) \* scale \+ GRID_GAP \* scale \+ 14\.0;/,
  'The page counts the same room');
assert.match(styles, /html \+= "px;--admin-page-extra:";\s*html \+= String\(admin_page_extra_px\(\)\);/);

// admin_page_extra_px for the S3.
const scale = 109 / 122;
const grid = 480 * scale + 2 + (2 * (146 + 10) * scale + 10 * scale + 14);
const extra = Math.ceil(grid) + 24 + 390 + 106 - 1200;
assert.equal(extra, 53);

const px = v => (v * scale).toFixed(2) + 'px';
const tiles = Array.from({length: 9}, (_, i) => `<div class="tile empty" data-index="${i}"></div>`).join('');
const tab = (id, side) => `<div id="tab${id}" class="tile-tab tab-content active"><div class="tile-editor"><div class="tile-editor-main">
<div class="tile-grid-scroll"><div class="tile-grid head-bar-grid${id === 0 ? ' has-page-fields' : ''}" style="--fields-right:${id === 0 ? (grid - 480 * scale - 2).toFixed(2) : 0}px">${tiles}</div></div>
${side}</div><div class="tile-settings"></div></div></div>`;
const html = `<!doctype html><html><head><style>${readRepoFile('src/web/assets/admin.css')}
:root{--grid-cols:3;--grid-rows:3;--preview-cell-w:${px(146)};--preview-cell-h:109px;--preview-gap:${px(10)};--preview-pad:${px(10)};
--preview-pad-left:${px(11)};--preview-pad-right:${px(11)};--preview-pad-top:${px(84)};--preview-pad-bottom:${px(10)};
--admin-wrapper-width:1200px;--settings-panel-width:390px;--admin-page-extra:${extra}px;}
</style></head><body><div class="wrapper compact-grid with-page-fields"><div class="card">
${tab(0, '<div id="pageSlots" class="page-fields"></div>')}
${tab(1, '<div class="settings-hidden-parking folder-side"><div class="settings-parking-texts"><button class="btn btn-danger">Delete</button></div></div>')}
</div></div><div id="result">running</div><script>
const width = el => Math.round(el.getBoundingClientRect().width);
const fails = [];
for (const id of [0, 1]) {
  const t = document.getElementById('tab' + id);
  const grid = width(t.querySelector('.tile-grid')), main = width(t.querySelector('.tile-editor-main'));
  const panel = width(t.querySelector('.tile-settings'));
  if (panel !== 390) fails.push((id ? 'Folder' : 'Home') + ': the settings panel is ' + panel + ' px, not 390');
  if (id === 0 && main !== grid) fails.push('Home: an empty column beside the grid (' + main + ' > ' + grid + ' px)');
}
const result = document.getElementById('result');
result.textContent = fails.join('; ') || 'ok';
result.dataset.result = fails.length ? 'fail' : 'pass';
</script></body></html>`;

runDomHarness({
  label: 'Square page fields keep the settings panel',
  html,
  tmpPrefix: 'hometiles-square-panel-',
  extraArgs: ['--window-size=1400,2400'],
});
