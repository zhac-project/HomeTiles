// The pages' overview pictures are kept per page (user 2026-10-13: the S3
// keeps four built grids, so from Home and four pages on every opening of the
// overview read the other grids from storage and it was slow). A page's
// picture is made from its built grid when the overview shows it or when the
// grid is let go, from the stored grid while the panel rests; the overview
// takes a kept picture before it would read storage; a change of the grid
// (Web Admin edit, theme) drops it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const slice = (text, start, end) => {
  const from = text.indexOf(start);
  assert.ok(from >= 0, 'missing ' + start);
  return text.slice(from, text.indexOf(end, from + start.length) + end.length);
};
const tiles = read('src/ui/tabs/tiles/tab_tiles_unified.cpp');

// One picture per page (Home and the pages), in PSRAM.
assert.match(tiles, /static PagePicture g_page_pictures\[tile_layouts::kMaxPages \+ 1\];/);
assert.match(slice(tiles, 'static PagePicture* page_picture_slot(', '\n}\n'),
  /heap_caps_malloc\(TILES_PER_GRID \* sizeof\(PageTileRect\), MALLOC_CAP_SPIRAM \| MALLOC_CAP_8BIT\)/);
assert.match(tiles, /static bool is_page_folder\(uint16_t folder_id\) \{\s*return folder_id != kInvalidFolderId && tile_layouts::page_number\(folder_id\) >= 0;/);

// The overview: a built grid live, else the kept picture, only then storage.
const schematic = slice(tiles, 'size_t tiles_page_schematic(', '\n}\n');
const live = schematic.indexOf('entry->widgets_valid && !entry->dirty');
const kept = schematic.indexOf('find_page_picture(folder_id)');
const stored = schematic.indexOf('tileConfig.loadFolderGrid(folder_id, *stored)');
assert.ok(live >= 0 && kept > live && stored > kept, 'Built grid, then the kept picture, then storage');
assert.match(schematic, /keep_page_picture\(folder_id, \*config, objs\);\s*return page_schematic_from\(\*config, objs, out, max\);/);

// A built page's grid leaves its picture when it is let go, a stale one not.
assert.match(slice(tiles, 'static void release_cache_entry(', '\n}\n'),
  /if \(entry\.grid && entry\.grid_loaded && entry\.widgets_valid && !entry\.dirty\) \{\s*keep_page_picture\(entry\.folder_id, entry\.grid_config, entry\.tile_objs\);/);

// A changed grid drops its picture: a folder's own change after its hidden
// grid went, every picture with the coarse invalidation (theme, edits).
const invalidation = slice(tiles, 'static void process_folder_cache_invalidation() {', '\n}\n');
assert.match(invalidation, /reset_cache_entry\(entry\);\s*\}\s*\/\/[^\n]*\n\s*forget_page_picture\(g_folder_only_invalidations\[n\]\);/);
assert.match(invalidation, /reset_cache_entry\(entry\);\s*\}\s*\}\s*forget_page_pictures\(\);\s*\}\s*$/);
// A prepared folder an edit dropped is built again while the panel rests,
// after the editing paused (user 2026-10-14: the way back to Home built it,
// 412 ms).
assert.match(invalidation, /forget_page_picture\(g_folder_only_invalidations\[n\]\);\s*rewind_navigation_preload\(g_folder_only_invalidations\[n\]\);/);
assert.match(tiles, /static void rewind_navigation_preload\(uint16_t folder_id\) \{\s*const size_t priority = navigation_preload_priority\(folder_id\);\s*if \(priority >= g_navigation_preload_target_count\) return;\s*if \(priority < g_navigation_preload_cursor\) g_navigation_preload_cursor = priority;\s*g_navigation_preload_not_before_ms = millis\(\) \+ kNavigationPreloadAfterEditMs;/);

// While the panel rests: one page a second from storage, never during a
// touch, a folder switch, an open overview or Web Admin work.
const prefill = slice(tiles, 'static void prefill_page_picture() {', '\n}\n');
assert.match(prefill, /if \(!grid_layout::head_bar\(\) \|\| g_folder_switch_pending \|\| page_preview::is_open\(\)\) return;/);
assert.match(prefill, /if \(lv_display_get_inactive_time\(nullptr\) < 3000 \|\| millis\(\) - last_ms < 1000\) return;/);
assert.match(prefill, /keep_page_picture\(folder_id, \*stored, nullptr\);\s*Serial\.printf\("\[Pages\] Picture of folder %u from storage in %lu ms\\n"/);
const reload = slice(tiles, 'void tiles_process_reload_requests() {', '\nsize_t tiles_page_schematic(');
assert.ok(reload.indexOf('if (webAdminRecentlyActive(1000)) {') < reload.indexOf('if (!did_reload) prefill_page_picture();'),
  'Not while the Web Admin works');
console.log('Page pictures: kept per page, made live or while resting, dropped on a change');
