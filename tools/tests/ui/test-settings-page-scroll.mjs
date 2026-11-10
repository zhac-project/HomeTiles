// A Settings page taller than its area scrolls under the finger (user
// 2026-10-14: the S3's Display page with Design cut the screensaver's
// brightness off and could not be scrolled; LVGL scrolls what a touch lands
// on or its parents, and the page's rows are no input). The real Settings
// screen on host LVGL (tools/settings-preview.mjs): a finger on a row's name
// drags 200 px up, the page reaches its end.
import assert from 'node:assert/strict';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readRepoFile, repoRoot} from '../../lib/admin-source.mjs';

const screen = readRepoFile('src/ui/tabs/settings/settings_screen.cpp');
assert.match(screen, /lv_obj_add_flag\(g_page, static_cast<lv_obj_flag_t>\(LV_OBJ_FLAG_SCROLLABLE \| LV_OBJ_FLAG_CLICKABLE\)\);\s*lv_obj_set_scroll_dir\(g_page, LV_DIR_VER\);\s*lv_obj_set_scrollbar_mode\(g_page, LV_SCROLLBAR_MODE_OFF\);/);
assert.match(screen, /lv_obj_add_event_cb\(g_page, \[\]\(lv_event_t\*\) \{ settings_parts::close_options\(\); \}, LV_EVENT_SCROLL_BEGIN, nullptr\);/,
  'An open option list closes when the page scrolls');
assert.match(screen, /if \(g_page\) lv_obj_scroll_to_y\(g_page, 0, LV_ANIM_OFF\);\s*build_page\(\);/, 'Another page starts at its top');

const run = spawnSync(process.execPath, [path.join(repoRoot, 'tools/settings-preview.mjs'), 's3', '--page=display', '--no-mockup', '--drag=up'],
  {encoding: 'utf8', timeout: 240000});
assert.equal(run.status, 0, run.stdout + run.stderr);
if (/^SKIP:/m.test(run.stdout)) {
  console.log(run.stdout.trim());
  process.exit(0);
}
const scroll = run.stdout.match(/page scroll (\d+) of (\d+)/);
assert.ok(scroll, 'The drag reports the page scroll: ' + run.stdout.slice(0, 400));
const [moved, end] = [Number(scroll[1]), Number(scroll[2])];
assert.ok(end > 0, 'The S3 Display page is taller than its area (else nothing to check): ' + end);
assert.equal(moved, end, 'The finger scrolls the page to its end: ' + moved + ' of ' + end);
console.log(`Settings page scroll: the S3 Display page follows the finger (${moved} of ${end} px)`);
