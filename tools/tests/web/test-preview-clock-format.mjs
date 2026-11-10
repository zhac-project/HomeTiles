// The preview's clocks follow the panel's time and date format (user
// 2026-10-11: 12 h was set, the head's time in the preview stayed 17:10):
// "Auto" clock tiles and the head take PANEL_TIME_FORMAT / PANEL_DATE_FORMAT
// (the page's values, like clock_tile::resolve_*), and the language poll
// updates them without a reload. The head shows no AM/PM, like a phone's
// status bar (user 2026-10-11).
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {extractDeliveredFunction, readRepoFile} from '../../lib/admin-source.mjs';

const read = file => readRepoFile(file).replace(/\r\n?/g, '\n');

const scripts = read('src/web/server/render/web_admin_scripts.cpp');
assert.ok(scripts.includes('html += "  let PANEL_TIME_FORMAT = " +') &&
  scripts.includes('String(clock_tile::resolve_time_format(clock_tile::TIME_FORMAT_AUTO, clock_cfg.global_time_format,'));
assert.ok(scripts.includes('html += "  let PANEL_DATE_FORMAT = " +'));

// "Auto" takes the panel's format; an explicit one stays.
const clock = vm.createContext({Number, String, document: {getElementById: () => null, documentElement: {lang: 'fr'}},
  PANEL_TIME_FORMAT: 2, PANEL_DATE_FORMAT: 3});
vm.runInContext(['getClockPreviewLanguage', 'normalizeClockTimeFormat', 'normalizeClockDateFormat',
  'resolveClockTimeFormat', 'resolveClockDateFormat'].map(extractDeliveredFunction).join('\n'), clock);
assert.equal(clock.resolveClockTimeFormat(0), 2, 'Auto shows 12 h when the panel has 12 h');
assert.equal(clock.resolveClockTimeFormat(1), 1, 'an explicit 24 h stays');
assert.equal(clock.resolveClockDateFormat(0), 3);

// The head: 5:10 as 05:10 with 12 h, never AM/PM.
const heads = [{dataset: {hour12: '0'}, textContent: ''}];
const head = vm.createContext({String, Date, PANEL_TIME_FORMAT: 2,
  document: {querySelectorAll: () => heads}});
vm.runInContext(extractDeliveredFunction('refreshHeadBarTime'), head);
head.refreshHeadBarTime();
const now = new Date();
const twelve = String(now.getHours() % 12 || 12).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
assert.equal(heads[0].textContent, twelve, 'the head follows the panel format, not the stale attribute');
assert.doesNotMatch(heads[0].textContent, /AM|PM/);

// The poll's answer updates the formats and draws the clocks again.
const calls = [];
const poll = vm.createContext({Array, String,
  PANEL_TIME_FORMAT: 1, PANEL_DATE_FORMAT: 1,
  refreshHeadBarTime: () => calls.push('head'),
  tileDataLoadedTabs: new Set(['folder0']),
  getTilesData: () => [{type: 9}, {type: 1}],
  renderTileFromData: (tab, index) => calls.push('tile' + index),
  sensorMetaCache: {}, screensaverLoaded: false});
vm.runInContext(extractDeliveredFunction('applyPanelClockFormats') +
  '\nglobalThis.formats = () => [PANEL_TIME_FORMAT, PANEL_DATE_FORMAT];', poll);
poll.applyPanelClockFormats(2, 1);
assert.deepEqual([...poll.formats()], [2, 1]);
assert.deepEqual(calls, ['head', 'tile0'], 'the head and the clock tiles are drawn again');
calls.length = 0;
poll.applyPanelClockFormats(2, 1);
assert.deepEqual(calls, [], 'an unchanged answer draws nothing');
assert.match(read('src/web/admin/core/localization.js'),
  /applyPanelClockFormats\(Number\(data\?\.time_format\), Number\(data\?\.date_format\)\);/);
console.log('Preview clocks follow the panel time and date format without a reload');
