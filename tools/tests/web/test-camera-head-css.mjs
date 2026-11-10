// The Camera tile's picture head in the preview (user 2026-10-11: "the pills
// do not connect"): with one shared pill the circle disappears behind it, and
// with circle and pill apart the circle is exactly as high as the pill, like
// the panel (camera_picture_layout::head). The size rule of icons above a
// title (.tile:is(.scene, ..., .switch:not(.switch-bar))) weighs one class
// more than it looks and used to win over the camera rules. Checked on the
// computed styles of the real admin.css in a browser.
import {readRepoFile} from '../../lib/admin-source.mjs';
import {runDomHarness} from '../../lib/headless-dom.mjs';

const css = readRepoFile('src/web/assets/admin.css');
const html = `<!doctype html><html><head><style>${css}
:root{--tile-radius:11px;--compact-inset:2px;--icon-disc-corner:34px;--icon-disc-round:30px;--corner-disc-shrink:2px;
--tile-header-icon-top:14px;--tile-header-icon-left:10px;--camera-title-pad:10px;--icon-size:20px;}
.tile{position:relative;width:92px;height:76px}
</style></head><body>
<div class="tile camera camera-picture camera-head-shared" id="shared"><i class="mdi tile-icon">V</i><div class="tile-title">Waveshare Camera</div></div>
<div class="tile camera camera-picture" id="split" style="width:194px"><i class="mdi tile-icon">V</i><div class="tile-title">Livingroom</div></div>
<pre id="result"></pre><script>
try {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const after = id => getComputedStyle(document.querySelector('#' + id + ' > .tile-icon'), '::after');
  const pill = id => document.querySelector('#' + id + ' > .tile-title').getBoundingClientRect();
  check(after('shared').opacity === '0', 'shared pill: the circle is hidden, opacity ' + after('shared').opacity);
  const circle = after('split');
  check(circle.opacity === '1', 'apart: the circle shows');
  check(parseFloat(circle.height) === pill('split').height,
    'apart: circle ' + circle.height + ' as high as the pill ' + pill('split').height);
  check(parseFloat(circle.width) === parseFloat(circle.height), 'apart: a square corner circle');
  document.body.dataset.result = 'pass';
} catch (error) { document.body.dataset.result = 'fail'; document.getElementById('result').textContent = error.message; }
</script></body></html>`;
try { runDomHarness({label: 'Camera head CSS', html, tmpPrefix: 'hometiles-camera-head-'}); }
catch (error) { throw Error(error.message.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || error.message.slice(0, 300)); }
console.log('Camera head: one shared pill hides the circle, apart the circle is as high as the pill');
