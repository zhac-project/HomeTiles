// An icon over its title in the Web Admin preview (user 2026-10-12: the
// title sat high and close under the icon, differently on every panel): the
// real admin.css puts the icon's and the one-line title's middle where the
// panel's tile_icon_disc::icon_title_offsets puts them (--icon-title-*-dy
// from the card's middle), for Folder, Scene, Camera and the Switch icon
// button, inside the 3 px editor border too; half tiles, the Switch bar and a
// Camera picture keep their own layouts.
import {readRepoFile} from '../../lib/admin-source.mjs';
import {runDomHarness} from '../../lib/headless-dom.mjs';

const css = readRepoFile('src/web/assets/admin.css');
const vars = '--icon-size:24px;--icon-title-icon-dy:-8.5px;--icon-title-title-dy:21px;--lh20:12px;--fs20:10px;--ldy20:0.5px';
const tile = (id, cls, extra = '') => `<div class="tile ${cls}" id="${id}" style="position:absolute;left:${10 + 110 * Number(id.slice(1))}px;top:10px;width:97px;height:76px;box-sizing:border-box;${extra}">
<span class="tile-icon">X</span><div class="tile-title">Lighting</div></div>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
:root{${vars}}
body{margin:0}
</style></head><body>
${tile('t0', 'navigate')}
${tile('t1', 'scene')}
${tile('t2', 'camera')}
${tile('t3', 'switch')}
${tile('t4', 'navigate', 'border:3px solid #26a69a')}
${tile('t5', 'navigate sensor-compact')}
${tile('t6', 'switch switch-bar')}
<pre id="result"></pre><script>
try {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const near = (a, b, message) => check(Math.abs(a - b) < 0.6, message + ': ' + a + ' vs ' + b);
  const middle = (el, tile) => {
    const r = el.getBoundingClientRect(), t = tile.getBoundingClientRect();
    return {x: r.left + r.width / 2 - (t.left + t.width / 2), y: r.top + r.height / 2 - (t.top + t.height / 2),
      top: r.top - (t.top + t.height / 2)};
  };
  for (const id of ['t0', 't1', 't2', 't3', 't4']) {
    const t = document.getElementById(id);
    const icon = middle(t.querySelector('.tile-icon'), t), title = middle(t.querySelector('.tile-title'), t);
    near(icon.y, -8.5, id + ' icon middle'); near(icon.x, 0, id + ' icon centered');
    // The first line starts half a panel line above the title's middle (its
    // box may run longer: two-line titles).
    near(title.top, 21 - 6 + 0.5, id + ' title line on the panel baseline');
    near(title.x, 0, id + ' title centered');
  }
  // Their own layouts stay.
  for (const id of ['t5', 't6']) {
    const t = document.getElementById(id);
    check(Math.abs(middle(t.querySelector('.tile-title'), t).top - 15.5) > 1, id + ' keeps its own title place');
  }
  document.body.dataset.result = 'pass';
} catch (error) { document.body.dataset.result = 'fail'; document.getElementById('result').textContent = error.message; }
</script></body></html>`;
try { runDomHarness({label: 'Icon over title preview', html, tmpPrefix: 'hometiles-icon-title-'}); }
catch (error) { throw Error(error.message.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || error.message.slice(0, 300)); }
console.log('Icon over title preview: icon and title where the panel puts them');
