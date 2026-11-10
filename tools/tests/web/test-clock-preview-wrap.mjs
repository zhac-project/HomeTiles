// A clock line wraps in the preview exactly where the panel's label wraps
// (user 2026-10-11: "8:01 PM" stood on one line on the V2 but wrapped in the
// preview). The panel's label is as wide as the card's padded box; the
// preview tile's 3 px editor border (hover, selection) made its box 6 px
// narrower, and the browser's Inter may run wider than the panel's font, so
// the preview measures against the panel's box and scales its widths by the
// LVGL width of a sample (--tw<size>, web_admin_styles.cpp).
// Runs the delivered preview functions on the real admin.css in a browser.
import assert from 'node:assert/strict';
import {extractDeliveredFunction, inlineScriptSafe, readRepoFile} from '../../lib/admin-source.mjs';
import {runDomHarness} from '../../lib/headless-dom.mjs';

const styles = readRepoFile('src/web/server/render/web_admin_styles.cpp');
assert.ok(styles.includes('lv_text_get_size(&sample, "88:88 PM", tabular_digits::font(font), 0, 0, LV_COORD_MAX, LV_TEXT_FLAG_NONE);') &&
  styles.includes('snprintf(name, sizeof(name), "tw%u", static_cast<unsigned>(size.nominal));'),
  'the server gives the panel width of the clock sample per font');
assert.ok(readRepoFile('src/types/clock/renderer.cpp').includes('if (config.fill_parent) lv_obj_set_width(label, LV_PCT(100));'),
  'the panel label is as wide as the card');

const functions = ['normalizeClockPreviewFont', 'getClockPreviewCssPx', 'applyClockPreviewLine', 'measureClockPreviewText',
  'clockPanelTextWidth', 'clockPreviewSample', 'fitCompactClockPreview'].map(extractDeliveredFunction).join('\n');
const css = readRepoFile('src/web/assets/admin.css');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
:root{--preview-cell-w:88px;--preview-cell-h:75px;--preview-gap:8px;--fs32:17px;--fs24:13px;--lh32:21px;--lh24:16px;}
body{margin:0}
</style></head><body>
<div class="tile clock" id="clock" data-span-w="1" data-span-h="1" style="position:absolute;left:10px;top:10px;width:88px;height:75px;padding:0 11px;box-sizing:border-box">
<div class="tile-clock-time" data-clock-font="32">8:01 PM</div><div class="tile-clock-date" data-clock-font="24">11.10.2026</div></div>
<pre id="result"></pre><script>
const CLOCK_PREVIEW_FONT_SIZES = [20, 24, 28, 32, 40, 48, 56, 64, 72, 80, 96];
const CLOCK_WIDTH_SAMPLE = '88:88 PM';
let clockPreviewMeasureContext = null;
${inlineScriptSafe(functions)}
try {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const tile = document.getElementById('clock');
  const time = tile.querySelector('.tile-clock-time');
  const root = document.documentElement.style;
  const avail = 88 - 22;
  const box = tile.clientWidth - 22;
  const browser = measureClockPreviewText(time, '8:01 PM', 17);
  const sample = measureClockPreviewText(time, CLOCK_WIDTH_SAMPLE, 17);
  check(getComputedStyle(tile).borderLeftWidth === '3px' && box === avail - 6, 'the editor border narrows the box: ' + box);
  check(browser > box && browser < avail, 'the case of the report: wider than the box, narrower than the panel line (' + browser + ')');
  // The panel's font is narrower: the time fits there, so it stays on one line.
  root.setProperty('--tw32', (sample * (avail - 2) / browser) + 'px');
  fitCompactClockPreview(tile);
  check(time.style.whiteSpace === 'nowrap', 'fits on the panel: one line, got "' + time.style.whiteSpace + '"');
  check(time.getBoundingClientRect().height < 30, 'one line high: ' + time.getBoundingClientRect().height);
  // Too wide on the panel too: it wraps like the panel's label.
  root.setProperty('--tw32', (sample * (avail + 4) / browser) + 'px');
  fitCompactClockPreview(tile);
  check(time.style.whiteSpace === '', 'too wide on the panel: it wraps, got "' + time.style.whiteSpace + '"');
  document.body.dataset.result = 'pass';
} catch (error) { document.body.dataset.result = 'fail'; document.getElementById('result').textContent = error.message; }
</script></body></html>`;
try { runDomHarness({label: 'Clock preview wrap', html, tmpPrefix: 'hometiles-clock-wrap-'}); }
catch (error) { throw Error(error.message.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || error.message.slice(0, 300)); }
console.log('Clock preview: a line wraps only where the panel wraps');
