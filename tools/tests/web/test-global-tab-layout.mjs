// The Global tabs of the tile pages and of the screensaver (user 2026-10-11:
// "give it a nice arrangement"): every label in one column, every field in
// the next, all fields 32 px high and flush to the panel's right edge, the
// design as a segmented choice. The head bar tab (user 2026-10-13): Home's
// title and icon like a tile's head, its options one under the other, three
// tabs on one row. Measured on the real admin.css in a browser at the usual
// panel width (390 px) and the narrowest one (300 px), with the longest
// labels (French) and the delivered fitChoiceRow.
import assert from 'node:assert/strict';
import {extractFunction, readAdminDeliverySource, readRepoFile} from '../../lib/admin-source.mjs';
import {runDomHarness} from '../../lib/headless-dom.mjs';

const css = readRepoFile('src/web/assets/admin.css');
const html = readRepoFile('src/web/server/render/web_admin_html.cpp');
// The markup below mirrors these server lines.
for (const marker of [
  '<div class=\\"icon-color-segmented choice-row global-theme\\" id=\\"" + theme_id +',
  'global_panel += "<div class=\\"gesture-settings\\"><div class=\\"tile-settings-group\\">";',
  // The head bar tab (user 2026-10-13): Title and Icon as in a tile's
  // head, then its options one under the other.
  'head_panel += "</h3><div class=\\"tile-head-row\\"><div><div class=\\"tile-title-label\\"><label for=\\"" + head_id +',
  'head_panel += "<div class=\\"head-bar-toggles\\">";',
  'head_panel += "<label class=\\"folder-pin-toggle\\"><input type=\\"checkbox\\" class=\\"";',
  '<div class=\\"global-settings-field screensaver-opacity-field\\"><label for=\\"screensaverTileOpacity\\">',
  'html += "</label><span class=\\"screensaver-opacity-control\\"><input id=\\"screensaverTileOpacity\\" type=\\"range\\" "',
  'html += "</label><div class=\\"icon-color-segmented choice-row screensaver-theme\\" id=\\"screensaverTheme\\" "',
]) assert.ok(html.includes(marker), marker);
const fit = extractFunction('fitChoiceRow', readAdminDeliverySource());

const L = {
  de: {layout: 'Layout', bar: 'Kopfleiste quer · 6 × 4', design: 'Design', d: 'Dunkel', l: 'Hell', a: 'Automatisch',
    sw: 'Wischen vom Rand', op: 'Kachel-Deckkraft', edges: ['Oben', 'Unten', 'Links', 'Rechts'], off: 'Aus',
    head: 'Kopfleiste', toggles: ['Zahnrad für Settings', 'Uhr', 'Seitenübersicht'],
    tabs: ['Kachel', 'Kopfleiste', 'Global'], homeTitle: 'Home-Titel', home: 'Home', icon: 'Icon'},
  fr: {layout: 'Disposition', bar: 'Barre d’en-tête paysage · 6 × 4', design: 'Thème', d: 'Sombre', l: 'Clair',
    a: 'Automatique', sw: 'Balayages depuis le bord', op: 'Opacité des tuiles', edges: ['Haut', 'Bas', 'Gauche', 'Droite'],
    off: 'Désactivé', head: 'Barre d’en-tête', toggles: ['Engrenage pour les réglages', 'Horloge', 'Aperçu des pages'],
    tabs: ['Tuile', 'Barre d’en-tête', 'Global'], homeTitle: 'Titre de l’accueil', home: 'Accueil', icon: 'Icône'},
};
const theme = (cls, t) => `<div class="global-settings-field"><label>${t.design}</label>` +
  `<div class="icon-color-segmented choice-row ${cls}" role="group"><button data-theme="0" class="active">${t.d}</button>` +
  `<button data-theme="1">${t.l}</button><button data-theme="2">${t.a}</button></div></div>`;
const tilePanel = (width, t) => `<div class="tile-settings" data-pane="global" style="--settings-panel-width:${width}px">` +
  '<div class="panel-global"><section class="global-settings-panel"><h3>Global</h3><div class="global-settings-grid">' +
  '<label class="inline-checkbox"><input type="checkbox" checked> Border</label>' +
  `<div class="global-settings-field"><label>${t.layout}</label><button type="button" class="layout-choice">` +
  `<span class="layout-current">${t.bar}</span><i class="mdi">e</i></button></div>${theme('global-theme', t)}` +
  `<div class="gesture-settings"><div class="tile-settings-group">${t.sw}</div>` +
  t.edges.map(edge => `<div class="global-settings-field"><label>${edge}</label><select class="gesture-edge">` +
    `<option>${t.off}</option></select></div>`).join('') + '</div></div></section></div></div>';
const headPanel = (width, t) => `<div class="tile-settings" data-pane="head" style="--settings-panel-width:${width}px">` +
  '<div class="icon-color-segmented choice-row panel-tabs" role="tablist">' +
  `<button data-pane="tile">${t.tabs[0]}</button><button data-pane="head">${t.tabs[1]}</button><button data-pane="global">${t.tabs[2]}</button></div>` +
  `<div class="panel-head"><section class="global-settings-panel"><h3>${t.head}</h3>` +
  `<div class="tile-head-row"><div><div class="tile-title-label"><label>${t.homeTitle}</label><button type="button" class="tile-title-auto on">Auto</button></div>` +
  `<textarea rows="1" class="tile-title-input home-head-title">${t.home}</textarea></div>` +
  `<div><label>${t.icon}</label><button type="button" class="tile-icon-picker"><i class="mdi">h</i></button></div></div>` +
  '<div class="head-bar-toggles">' +
  t.toggles.map(label => `<label class="folder-pin-toggle"><input type="checkbox" checked><span>${label}</span></label>`).join('') +
  '</div></section></div></div>';
const saverPanel = (width, t) => `<div class="tile-settings" data-pane="options" style="--settings-panel-width:${width}px">` +
  '<div class="panel-options"><section class="global-settings-panel"><h3>Global</h3><div class="global-settings-grid">' +
  '<label class="inline-checkbox"><input type="checkbox" checked> Border</label>' +
  '<label class="inline-checkbox"><input type="checkbox" checked> Shadow</label>' +
  `<div class="global-settings-field screensaver-opacity-field"><label>${t.op}</label>` +
  '<span class="screensaver-opacity-control"><input type="range" min="0" max="255" value="200">' +
  `<output class="global-tile-opacity-value">78 %</output></span></div>${theme('screensaver-theme', t)}` +
  '</div></section></div></div>';

const panels = [];
for (const width of [390, 300]) {
  for (const lang of ['de', 'fr']) panels.push(tilePanel(width, L[lang]), saverPanel(width, L[lang]), headPanel(width, L[lang]));
}
const page = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
body{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start;width:1700px}
.tile-settings{position:relative!important;margin-left:0!important;max-height:none!important}
</style></head><body>${panels.join('')}<pre id="result"></pre><script>
${fit}
try {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const near = (a, b) => Math.abs(a - b) <= 1;
  document.querySelectorAll('.choice-row').forEach(fitChoiceRow);
  document.querySelectorAll('.tile-settings').forEach((panel, index) => {
    const name = 'panel ' + index + ' (' + panel.style.cssText + ')';
    if (panel.dataset.pane === 'head') {
      // Three tabs on one row, none cut; Title and Icon side by side like a
      // tile's head, the icon at the panel's edge; the options one under the
      // other at the start, below them.
      const tabs = [...panel.querySelectorAll('.panel-tabs > button')];
      check(new Set(tabs.map(tab => Math.round(tab.getBoundingClientRect().top))).size === 1, name + ': the tabs on one row');
      for (const tab of tabs) check(tab.scrollWidth <= tab.clientWidth + 0.5, name + ': tab "' + tab.textContent + '" is cut');
      const body = panel.querySelector('.panel-head');
      check(getComputedStyle(body).display !== 'none' && body.scrollWidth <= body.clientWidth, name + ': head pane hidden or scrolls sideways');
      const edge = panel.getBoundingClientRect().right - 21;
      const title = panel.querySelector('.home-head-title').getBoundingClientRect();
      const icon = panel.querySelector('.tile-icon-picker').getBoundingClientRect();
      check(near(icon.right, edge) && near(icon.left - title.right, 8) && near(icon.top, title.top), name + ': title and icon side by side');
      const start = panel.querySelector('.panel-head h3').getBoundingClientRect().left;
      const toggles = [...panel.querySelectorAll('.head-bar-toggles > .folder-pin-toggle')];
      check(toggles.length === 3, name + ': three options');
      toggles.forEach((toggle, i) => {
        const box = toggle.getBoundingClientRect();
        check(near(box.left, start), name + ': option ' + i + ' not at the start');
        check(box.top >= (i ? toggles[i - 1].getBoundingClientRect().bottom : title.bottom), name + ': option ' + i + ' not below');
      });
      return;
    }
    const body = panel.querySelector('.panel-global, .panel-options');
    check(body.scrollWidth <= body.clientWidth, name + ': scrolls sideways');
    const right = panel.getBoundingClientRect().right - 21;
    const fields = [...panel.querySelectorAll('.global-settings-field:not(.screensaver-opacity-field)')];
    const left = fields[0].children[1].getBoundingClientRect().left;
    for (const field of fields) {
      const [label, control] = field.children;
      const box = control.getBoundingClientRect();
      const what = name + ' ' + label.textContent;
      check(near(box.left, left), what + ': field starts at ' + box.left + ', not ' + left);
      check(near(box.right, right), what + ': field ends at ' + box.right + ', not ' + right);
      check(near(box.height, 32), what + ': field ' + box.height + ' px high');
      const labelBox = label.getBoundingClientRect();
      check(near(labelBox.top + labelBox.height / 2, box.top + box.height / 2), what + ': label not centred');
      check(labelBox.right <= left, what + ': label runs into the field');
    }
    for (const button of panel.querySelectorAll('.choice-row button')) {
      check(button.scrollWidth <= button.clientWidth + 0.5, name + ': "' + button.textContent + '" is cut');
    }
    for (const caption of panel.querySelectorAll('.global-settings-grid .tile-settings-group')) {
      check(near(caption.getBoundingClientRect().right, right + 1) || caption.getBoundingClientRect().width > right - left,
            name + ': caption "' + caption.textContent + '" not across the panel');
      check(getComputedStyle(caption).textTransform === 'uppercase', name + ': caption unlike the tile settings captions');
    }
    // A list's text in its middle (user 2026-10-13: it sat high).
    for (const select of panel.querySelectorAll('.global-settings-grid select')) {
      const style = getComputedStyle(select);
      check(parseFloat(style.paddingTop) === parseFloat(style.paddingBottom) &&
            near(parseFloat(style.lineHeight) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth), 32),
            name + ': the text of a list not in its middle');
    }
    const range = panel.querySelector('input[type=range]');
    if (range) {
      const label = panel.querySelector('.screensaver-opacity-field > label').getBoundingClientRect();
      const value = panel.querySelector('.global-tile-opacity-value').getBoundingClientRect();
      const slider = range.getBoundingClientRect();
      check(near(value.top + value.height / 2, label.top + label.height / 2), name + ': the value beside its label');
      check(near(value.right, right) && near(slider.right, right), name + ': value and slider end at the edge');
      check(near(slider.left, label.left) && slider.top >= label.bottom, name + ': the slider below, across the panel');
    }
  });
  document.body.dataset.result = 'pass';
} catch (error) { document.body.dataset.result = 'fail'; document.getElementById('result').textContent = error.message; }
</script></body></html>`;
try { runDomHarness({label: 'Global tab layout', html: page, tmpPrefix: 'hometiles-global-tab-', extraArgs: ['--window-size=1720,1400']}); }
catch (error) { throw Error(error.message.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || error.message.slice(0, 300)); }
console.log('Global tabs: one label column, fields flush and 32 px high, no cut choice at 390 and 300 px; head bar tab: title and icon, options below');
