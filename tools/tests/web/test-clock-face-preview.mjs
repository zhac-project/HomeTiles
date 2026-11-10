// The analog and the wall clock in the Web Admin preview (user 2026-10-12):
// the delivered preview code places the face and its lines on the real
// admin.css exactly where the panel's clock_face_layout puts them, scaled
// like the grid (--radius-preview-scale) inside the tile's 3 px editor
// border, with the wall clock's colors and the panel's measures (--tw / --lh).
// Face and lines are one block that the tile's alignment moves (the lines
// stood far right of the face and the alignment did nothing), and a resized
// tile is laid out again (a 1.5x2 clock kept its 1x1 face without the date).
import assert from 'node:assert/strict';
import {extractDeliveredFunction, inlineScriptSafe, readRepoFile} from '../../lib/admin-source.mjs';
import {runDomHarness} from '../../lib/headless-dom.mjs';

const admin = readRepoFile('src/types/clock/admin.js');
const constant = name => new RegExp(`const ${name} = [^;]*;`).exec(admin)[0];
const functions = ['layoutClockFacePreview', 'clockFaceLayout', 'clockFaceTimeFit', 'clockFaceSvg', 'clockDialColor',
  'clockDateOptions', 'normalizeClockDateFormat', 'applyClockPreviewTextStyle', 'normalizeClockPreviewFont',
  'getClockPreviewCssPx', 'applyClockPreviewLine', 'observeClockTile', 'clockLinePanelWidth', 'clockDigitsHtml']
  .map(extractDeliveredFunction).join('\n');
// The resize observer as delivered (it calls the three layout functions).
const observerStart = admin.indexOf('const clockTileObserver =');
const observer = admin.slice(observerStart, admin.indexOf(': null;', observerStart) + ': null;'.length);
// Its entities hold semicolons: up to the object's end.
const escapesStart = admin.indexOf('const CLOCK_HTML_ESCAPES');
const escapes = admin.slice(escapesStart, admin.indexOf('};', escapesStart) + 2);
const css = readRepoFile('src/web/assets/admin.css');
// Device measures of a 1280x800 panel at half size in the preview.
const half = v => `${v / 2}px`;
const tw = {56: 254, 40: 181, 32: 146, 24: 109, 20: 91};
const lh = {56: 68, 40: 49, 32: 39, 24: 29, 20: 24};
const vars = [
  '--radius-preview-scale:0.5', '--clock-face-m:16px', '--clock-face-m-compact:6px', '--clock-face-gap:6px',
  '--clock-face-header:67px',
  ...Object.entries(tw).map(([n, v]) => `--tw${n}:${half(v)}`), ...Object.entries(lh).map(([n, v]) => `--lh${n}:${half(v)}`),
  ...[20, 24, 32, 40, 56].map(n => `--fs${n}:${n / 2}px`),
].join(';');
const tile = (id, w, h, options, cls = '') => `<div class="tile clock ${cls}" id="${id}" style="position:absolute;left:10px;top:${10 + 200 * Number(id.slice(1))}px;width:${w / 2}px;height:${h / 2}px;box-sizing:border-box">
<svg class="tile-clock-face" data-options="${options}"></svg><div class="tile-clock-face-text"><div class="tile-clock-time">00:42</div><div class="tile-clock-date">Mon, 12.10.</div></div></div>`;
const wall = (2 << 13) | (4 << 16) | (1 << 19);
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
:root{${vars}}
body{margin:0}
</style></head><body>
${tile('t0', 406, 150, wall)}
${tile('t1', 180, 150, 1 << 13, 'clock-has-header')}
${tile('t2', 170, 64, 1 << 13, 'clock-compact')}
${tile('t3', 406, 150, wall | (1 << 11))}
${tile('t4', 406, 150, wall | (2 << 11))}
${tile('t5', 193, 150, 1 << 13)}
<pre id="result"></pre><script>
${constant('CLOCK_FACE_TIME_SIZES')}
${constant('CLOCK_DIAL_COLORS')}
${constant('CLOCK_HAND_COLORS')}
${escapes}
${constant('CLOCK_WIDTH_SAMPLE')}
const fitCompactClockPreview = () => {};
// Colors are not this test's subject: the panel roles and tones stubbed.
const panelRoleHex = (name, fallback) => fallback;
const panelRole = () => [255, 255, 255];
const panelLight = () => false;
const panelVar = (name, fallback) => fallback;
const cssColorChannels = () => [26, 26, 26];
const toneNoColor = () => true;
const toneBlend = (under) => under;
const toneHex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
const toneFill = () => ({disc: [44, 44, 44]});
${inlineScriptSafe(functions)}
// Headless Chrome delivers resize notifications only now and then: the
// observer's callback is fired by hand after the tile grows.
let observed = [], notify = null;
class ResizeObserver {
  constructor(callback) { notify = callback; }
  observe(el) { observed.push(el); }
  unobserve(el) { observed = observed.filter(other => other !== el); }
}
${inlineScriptSafe(observer)}
(async () => { try {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const near = (a, b, message) => check(Math.abs(a - b) < 0.6, message + ': ' + a + ' vs ' + b);
  const box = (el, tile) => {
    const r = el.getBoundingClientRect(), t = tile.getBoundingClientRect();
    return {x: r.left - t.left, y: r.top - t.top, w: r.width, h: r.height};
  };
  // A wide wall clock: the face 150 - 32 high, the time at 40 (56 does not
  // fit 406 - 166 px), the lines one margin (16) right of the face; face and
  // lines centered together (the default alignment).
  const t0 = document.getElementById('t0');
  check(getComputedStyle(t0).borderLeftWidth === '3px', 'the editor border');
  layoutClockFacePreview(t0);
  const face0 = box(t0.querySelector('.tile-clock-face'), t0);
  near(face0.y, 8, 'face y'); near(face0.w, 59, 'face size');
  const svg = t0.querySelector('.tile-clock-face').innerHTML;
  check(svg.includes('fill="#26364F"'), 'the navy dial');
  check(svg.includes('stroke="#C3C7CC"'), 'silver hands');
  const text0 = box(t0.querySelector('.tile-clock-face-text'), t0);
  near(text0.x, face0.x + face0.w + 8, 'the lines one gap beside the face');
  check(text0.w > 40 && text0.w < 120, 'the lines box as wide as its lines: ' + text0.w);
  near((face0.x + text0.x + text0.w) / 2, 406 / 4, 'face and lines centered together');
  const time0 = box(t0.querySelector('.tile-clock-time'), t0), date0 = box(t0.querySelector('.tile-clock-date'), t0);
  near(time0.x, text0.x, 'the time starts at the lines'); near(date0.x, text0.x, 'the date too');
  check(t0.querySelector('.tile-clock-time').dataset.clockFont === '40', 'time at 40: ' + t0.querySelector('.tile-clock-time').dataset.clockFont);
  check(!t0.querySelector('.tile-clock-date').hidden, 'the date beside');
  // Left and right move the block to the margin (16 device px).
  const t3 = document.getElementById('t3');
  layoutClockFacePreview(t3);
  near(box(t3.querySelector('.tile-clock-face'), t3).x, 8, 'left: the face at the margin');
  const t4 = document.getElementById('t4');
  layoutClockFacePreview(t4);
  const text4 = box(t4.querySelector('.tile-clock-face-text'), t4);
  near(text4.x + text4.w, (406 - 16) / 2, 'right: the lines end at the margin');
  near(text4.w, text0.w, 'the same lines');
  // A 1x1 tile with a header: the face alone below the header.
  const t1 = document.getElementById('t1');
  layoutClockFacePreview(t1);
  check(t1.querySelector('.tile-clock-face-text').hidden, 'no lines in a small tile with a header');
  const face1 = box(t1.querySelector('.tile-clock-face'), t1);
  near(face1.y, (67 + 16) / 2, 'below the header'); near(face1.w, (150 - 67 - 32) / 2, 'the face fills the rest');
  check(t1.querySelector('.tile-clock-face').innerHTML.includes('fill="#2C2C2C"'), 'the analog dial: the theme circle');
  // A narrow half tile: the time alone beside a small face.
  const t2 = document.getElementById('t2');
  layoutClockFacePreview(t2);
  check(!t2.querySelector('.tile-clock-time').hidden && t2.querySelector('.tile-clock-date').hidden, 'the time alone');
  near(box(t2.querySelector('.tile-clock-face'), t2).w, (64 - 12) / 2, 'the half tile face');
  // A tile laid out at 1x1 and then grown to 1.5x2 (193x150 -> 298x319):
  // the observer places the face again, now with the date below it.
  const t5 = document.getElementById('t5');
  layoutClockFacePreview(t5);
  near(box(t5.querySelector('.tile-clock-face'), t5).w, (150 - 32) / 2, 'the 1x1 face');
  check(t5.querySelector('.tile-clock-face-text').hidden, '1x1: the face alone');
  t5.style.width = (298 / 2) + 'px';
  t5.style.height = (319 / 2) + 'px';
  check(observed.includes(t5), 'the laid out tile is observed');
  notify(observed.map(target => ({target})));
  check(!t5.querySelector('.tile-clock-face-text').hidden && !t5.querySelector('.tile-clock-date').hidden,
    'grown: the date below the face');
  near(box(t5.querySelector('.tile-clock-face'), t5).w, 242 / 2, 'grown: the larger face');
  // On a page not shown (user 2026-10-14, console: viewBox "0 0 -32 -32"):
  // nothing is laid out at 0 x 0, the observer does it once it shows.
  const hiddenPage = document.createElement('div');
  hiddenPage.style.display = 'none';
  document.body.appendChild(hiddenPage);
  const t6 = t1.cloneNode(true);
  t6.id = 't6';
  t6.__clockObserved = false;
  t6.querySelector('.tile-clock-face').removeAttribute('viewBox');
  hiddenPage.appendChild(t6);
  layoutClockFacePreview(t6);
  check(!t6.querySelector('.tile-clock-face').hasAttribute('viewBox') && observed.includes(t6), 'hidden: no face laid out, observed');
  hiddenPage.style.display = '';
  notify([{target: t6}]);
  const shownBox = t6.querySelector('.tile-clock-face').getAttribute('viewBox');
  const shownSize = (shownBox || '').split(' ').map(Number);
  check(shownSize.length === 4 && shownSize[2] > 0 && shownSize[2] === shownSize[3], 'shown: the face laid out: ' + shownBox);
  document.body.dataset.result = 'pass';
} catch (error) { document.body.dataset.result = 'fail'; document.getElementById('result').textContent = error.message; } })();
</script></body></html>`;
try { runDomHarness({label: 'Clock face preview', html, tmpPrefix: 'hometiles-clock-face-', extraArgs: ['--virtual-time-budget=2000']}); }
catch (error) { throw Error(error.message.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || error.message.slice(0, 300)); }
// The editor places the face after it gave the tile its size again: in the
// middle of its rebuild the tile measured 1 x 1, and a size that returns
// within the same task never reaches the resize observer (user 2026-10-12: a
// click on a 2 x 1.5 clock shrank its face into the corner).
{
  const live = readRepoFile('src/web/admin/tiles/live-preview.js');
  const update = live.slice(live.indexOf('function updateTilePreview('));
  const layoutAt = update.indexOf('layoutClockFacePreview(tileElem)');
  const sized = update.lastIndexOf('updateLayoutFromInputs(tab);');
  if (!(sized > 0 && layoutAt > sized && layoutAt > update.lastIndexOf('applyCompactSensorPreview(tileElem, type,'))) {
    throw Error('the live preview places the clock face before the tile has its size');
  }
}
console.log('Clock face preview: face and lines where the panel puts them');
