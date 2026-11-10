// Pages in the head bar layouts (user 2026-10-12, mockup
// build/design-mockups/pages): up to six Home folders become pages beside
// Home; dots in the head, swipes left and right, the neighbours preloaded, a
// page's folder tile off Home in the bar layouts only, and the Web Admin's
// /api/pages that keeps every folder reachable.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
const slice = (text, start, end) => {
  const from = text.indexOf(start);
  assert.ok(from >= 0, 'missing ' + start);
  const to = end ? text.indexOf(end, from + start.length) : text.length;
  assert.ok(to > from, 'missing end ' + end);
  return text.slice(from, to);
};

// Storage: in the layout file, five places at most, each folder once, never
// Home. Every page stays in its place and free places stay free (user
// 2026-10-12: nothing moves up); the dots skip the free places, and a
// deleted folder leaves its place free.
const layoutsH = read('src/tiles/config/tile_layouts.h');
const layouts = read('src/tiles/config/tile_layouts.cpp');
// Five pages beside Home, six dots with it (user 2026-10-12).
assert.match(layoutsH, /inline constexpr size_t kMaxPages = 5;/);
const store = slice(layouts, 'bool store_pages_locked(', '\n}\n');
assert.match(store, /for \(size_t i = 0; i < count && i < kMaxPages; \+\+i\)/);
assert.match(store, /wanted\[i\] = folder;\s*used = i \+ 1;/, 'In its own place');
const pageNumber = slice(layouts, 'int page_number(uint16_t folder_id) {', '\n}\n');
assert.match(pageNumber, /if \(!g_page_count\) return -1;\s*if \(folder_id == 0\) return 0;/, 'Home is page 0 only with pages');
assert.match(pageNumber, /if \(!g_pages\[i\]\) continue;\s*\+\+number;/, 'The dots skip free places');
assert.match(slice(layouts, 'size_t pages(uint16_t out[kMaxPages]) {', '\n}\n'), /if \(g_pages\[i\]\) out\[count\+\+\] = g_pages\[i\];/);
assert.match(slice(layouts, 'void drop_folder(', '\n}\n'), /std::replace\(kept, kept \+ kMaxPages, folder_id, static_cast<uint16_t>\(0\)\);/);
// Both ways in (/api/pages, the layout window's /api/layouts) keep a 0 as a
// free place: one check for the slots.
const savedPages = read('src/web/server/handlers/web_admin_tiles.cpp');
assert.match(slice(savedPages, 'const char* checkPageSlots(', '\n}\n'), /if \(!id\) continue;/, 'The device keeps free places');
assert.match(savedPages, /\/\/ 0: a free slot, kept in its place \(user 2026-10-12\)\.\s*if \(id < 0 \|\| id >= 0xFFFF\) \{[\s\S]*?\}\s*wanted\.push_back\(static_cast<uint16_t>\(id\)\);/);
assert.match(layouts, /for \(JsonVariantConst folder : doc\["pages"\]\.as<JsonArrayConst>\(\)\)/);
assert.match(layouts, /out \+= ",\\"pages\\":\[";/);

// A page's folder tile leaves Home in the bar layouts; the classic layout
// keeps it (it returns before).
const tileConfig = read('src/tiles/config/tile_config.cpp');
const apply = slice(tileConfig, 'static void applyLayoutPlaces(', 'showUnplacedSettingsTile(grid);');
const classicReturn = apply.indexOf('if (active == Layout::kClassic) {');
const pageHide = apply.indexOf('tile_layouts::page_number(getNavigateTargetId(tile)) > 0');
assert.ok(classicReturn >= 0 && pageHide > classicReturn, 'Pages only in the bar layouts');
assert.match(apply, /if \(folder_id == TileConfig::rootFolderId\(\) && tile\.type == TILE_FOLDER &&/);

// The head: dots on Home and its pages, the gear there; a folder keeps its X.
const bar = read('src/ui/tabs/tiles/home_bar.cpp');
const build = slice(bar, 'void build(lv_obj_t* grid, uint16_t folder_id) {', '\n}\n');
assert.match(build, /const int page = tile_layouts::page_number\(folder_id\);\s*const bool home_level = home \|\| page > 0;/);
assert.match(build, /getMdiChar\(home_level \? "cog" : "window-close"\)/);
assert.match(build, /if \(page >= 0\) \{/);
assert.match(build, /const int count = static_cast<int>\(tile_layouts::pages\(pages\)\) \+ 1;/);
// The grey dots and, last, the line in the text color (user 2026-10-12:
// it follows the finger; mockup build/design-mockups/pages/dots-swipe.html).
const dotsRow = slice(bar, 'lv_obj_t* create_dots(', '\n}\n');
assert.match(dotsRow, /for \(int i = 0; i <= count; \+\+i\) \{[\s\S]*lv_obj_set_size\(dot, i == count \? d\.active : d\.dot, d\.dot\);[\s\S]*lv_color_hex\(dot_color\(i == count\)\)/);
assert.match(dotsRow, /lay_out_line\(dots, active, active, 0, 0\);/);
const line = slice(bar, 'void lay_out_line(lv_obj_t* dots, int i, int j, float p, int stretch) {', '\n}\n');
assert.match(line, /left = l0 \+ \(l1 - l0\) \* ease_in\(p\);\s*right = l0 \+ d\.active \+ \(l1 - l0\) \* ease_out\(p\);/, 'Its leading edge runs ahead');
assert.match(line, /const float x = k == i \? to_x : k == j \? from_x : from_x \+ \(to_x - from_x\) \* p;/, 'The grey dots stand still');
// Sized like the mockup: 12 and 34 on an 800 px short side.
assert.match(bar, /const int dot = \(12 \* side \+ 400\) \/ 800;\s*return \{dot, \(34 \* side \+ 400\) \/ 800, dot\};/);
// A page turn: the line goes over on the old page first (120 ms) and the
// new page shows as it arrives, its line at rest (user 2026-10-12: started
// after the new page, the dots trailed behind it).
const shown = slice(bar, 'void shown(lv_obj_t* grid, uint16_t folder_id, uint16_t previous_folder_id) {', '\n}\n');
// Whatever came before (user 2026-10-13: back from a folder inside page 1
// by the Home swipe, Home's line stayed on the second dot, where the page
// turn's lead had left it).
assert.match(shown, /if \(!dots \|\| page < 0\) return;[\s\S]*lay_out_line\(dots, page, page, 0, 0\);/);
assert.doesNotMatch(shown, /from < 0/);
assert.match(slice(bar, 'void glide(', '\n}\n'), /move_line\(dots, from, to, 0\.0f, 1\.0f, 0, duration\);/);
assert.doesNotMatch(bar, /bool lead\(/, 'The head line no longer goes ahead of a page turn');
const leadManager = read('src/ui/ui_manager.cpp');
const lead = slice(leadManager, 'void UIManager::showPage(int number) {', '\n}\n');
// The new page shows at once (user 2026-10-13: swiping felt slower than
// Settings, the turn waited 120 ms for the head's line).
assert.match(lead, /if \(number < 0 \|\| number > count \|\| number == current\) return;\s*openPage\(number\);/);
assert.doesNotMatch(leadManager, /g_page_lead|page_lead_done|home_bar::lead\(/);
assert.match(leadManager, /static constexpr uint32_t kPageLeadMs = 120;/);
assert.doesNotMatch(bar, /start_waiting|move_line_after_frame/);
// No line following the finger (user 2026-10-12: it snaps at once).
assert.doesNotMatch(bar, /void drag\(|int release\(|g_handoff/);
// The dots: one touch, one meaning (user 2026-10-13: they opened sometimes
// and sometimes not; the pill showed at the start of every swipe). While
// the finger stays within a tap's distance it is a press: the pill once it
// rested 100 ms (like Android's tap timeout), a tap opens the overview on
// the lift, a hold of 400 ms under the finger, which then picks a page by
// sliding onto it and lifting; a finger that went further is a swipe (no
// pill, no overview); whenever a swipe takes over the pill goes.
assert.doesNotMatch(bar, /kPressShowMs/);
assert.match(bar, /constexpr uint32_t kHoldOpenMs = 400;/);
assert.match(bar, /if \(code == LV_EVENT_PRESSED\) \{\s*g_press_dots = dots;\s*g_press_ms = lv_tick_get\(\);\s*g_press_held = false;\s*g_press_at = now;\s*return;\s*\}/,
  'Not on the press itself');
assert.match(bar, /const int32_t limit = touch_rules::kTapSlop;\s*if \(dx \* dx \+ dy \* dy > limit \* limit\) \{[^}]*release_press\(dots\);\s*return;\s*\}/,
  'A tap\'s distance ends the press');
assert.match(bar, /\} else if \(held >= touch_rules::kPressDelayMs && !lv_obj_has_state\(dots, LV_STATE_USER_1\)\) \{\s*lv_obj_add_state\(dots, LV_STATE_USER_1\);/);
assert.match(bar, /if \(held >= kHoldOpenMs\) \{[\s\S]*?g_press_held = true;\s*uiManager\.cancelTouchGesture\(\);\s*if \(!page_preview::is_open\(\)\) page_preview::open\(dots\);/,
  'A hold opens it under the finger; no page turns then');
assert.match(bar, /if \(g_press_held\) \{\s*page_preview::point_at\(now\);\s*return;\s*\}/);
assert.match(bar, /if \(g_press_held\) \{\s*release_press\(dots\);\s*page_preview::lift_at\(now\);\s*return;\s*\}\s*release_press\(dots\);\s*if \(!page_preview::is_open\(\)\) page_preview::open\(dots\);/);
assert.doesNotMatch(bar, /on_dots|popup_layout::scale\(8\)/, 'No click of LVGL decides it (a few pixels of drift cancelled it)');
assert.match(bar, /lv_obj_remove_flag\(dots, LV_OBJ_FLAG_SCROLL_CHAIN\);/);
assert.equal((read('src/ui/ui_manager.cpp').match(/home_bar::cancel_press\(\);/g) || []).length, 2, 'A page turn and an edge action take the pill away');
assert.match(read('src/ui/shared/touch_rules.h'), /constexpr int kTapSlop = popup_layout::scale\(20\);[\s\S]*constexpr int kSwipeDistance = popup_layout::scale\(48\);/);
assert.doesNotMatch(bar, /g_press_timer|press_show/);
const tiles = read('src/ui/tabs/tiles/tab_tiles_unified.cpp');
assert.equal((tiles.match(/home_bar::shown\(target->grid, folder_id, previous \? previous->folder_id : kInvalidFolderId\);/g) || []).length, 2,
  'Both folder switch paths report the shown grid');

// The neighbours are preloaded first.
const plan = slice(tiles, 'static void schedule_navigation_preload(', '\n}\n');
const neighbours = plan.indexOf('for (const int neighbour : {page + 1, page - 1})');
const back = plan.indexOf('if (config.tiles[i].type != TILE_BACK) continue;');
assert.ok(neighbours >= 0 && back > neighbours, 'Pages before Back and folder tiles');

// The swipe: on Home or a page from anywhere (user 2026-10-13: not only from
// the edge, the head or the empty places), never on the head's gear or X or
// a control that drags itself (no gesture bubble: a dimmer's level bar).
// No false input: a touch on the tiles that moved further than a tap is
// neither a tap nor a long press (the input hears them before the tile), and
// a long press ends the swipe. An edge's own action comes first; a sideways
// move from the top edge's strip still turns the page.
const manager = read('src/ui/ui_manager.cpp');
const press = slice(manager, 'void UIManager::settings_gesture_indev_event_cb', '\nvoid UIManager::nav_button_event_cb');
assert.match(press, /const bool page_swipe = tab == 0 && grid_layout::head_bar\(\) &&\s*tile_layouts::page_number\(tileConfig\.getActiveFolderId\(\)\) >= 0 &&\s*!home_bar::is_button\(pressed_object\) && !drags_itself;/);
assert.match(press, /for \(lv_obj_t\* object = pressed_object; object && lv_obj_get_parent\(object\) && object != self->tab_panels\[tab\];\s*object = lv_obj_get_parent\(object\)\) \{\s*if \(!lv_obj_has_flag\(object, LV_OBJ_FLAG_GESTURE_BUBBLE\)\) drags_itself = true;/);
assert.doesNotMatch(press, /on_empty_place|GRID_PAD_TOP/);
assert.match(read('src/tiles/runtime/level_bar.h'), /lv_obj_remove_flag\(bar, LV_OBJ_FLAG_GESTURE_BUBBLE\);/, 'The level bars drag themselves');
assert.match(press, /self->touch_watched = tab == 0 && !drags_itself;/);
// Only the ways a swipe can start count at a tap's distance (user
// 2026-10-13: a page tap that rolled 20 px down was swallowed);
// test-touch-tap-rules runs the rule itself.
assert.match(press, /self->touch_sideways = page_swipe \|\| edge < 2;\s*self->touch_upright = edge == 2 \|\| edge == 3;/);
assert.match(press, /self->touch_moved = false;\s*self->touch_sideways = false;\s*self->touch_upright = false;/,
  "Every touch starts without the last one's ways");
assert.match(press, /if \(code == LV_EVENT_SHORT_CLICKED \|\| code == LV_EVENT_CLICKED \|\| code == LV_EVENT_LONG_PRESSED\) \{\s*if \(self->touch_watched && self->touch_moved\) \{\s*lv_indev_stop_processing\(input\);[\s\S]*?return;\s*\}\s*if \(code == LV_EVENT_LONG_PRESSED\) \{[^}]*self->cancelTouchGesture\(\);/);
for (const code of ['LV_EVENT_SHORT_CLICKED', 'LV_EVENT_CLICKED', 'LV_EVENT_LONG_PRESSED']) {
  assert.match(manager, new RegExp(`lv_indev_add_event_cb\\(input, settings_gesture_indev_event_cb,\\s*${code}, this\\);`), code + ' reaches the input first');
}
// Only while the finger is down and on two readings in a row: a single jump
// of the touch chip (at the lift above all) swallowed taps (user 2026-10-13).
assert.match(manager, /const bool far = touch_rules::far_from_tap\(dx, dy, touch_sideways, touch_upright\);\s*touch_far_readings = far \? static_cast<uint8_t>\(touch_far_readings \+ 1\) : 0;\s*if \(touch_far_readings < 2\) return;\s*touch_moved = true;/);
assert.ok(manager.includes('Serial.printf("[Touch] No tap: the finger moved %d,%d px\\n"'), 'A swallowed tap is logged');
assert.match(press, /if \(code == LV_EVENT_RELEASED\) \{[\s\S]*?self->processSettingsGestureMotion\(input, true\);\s*\}\s*\}\s*$/);
assert.doesNotMatch(slice(press, 'if (code == LV_EVENT_RELEASED) {', 'self->processSettingsGestureMotion(input, true);'), /noteTouchMotion/,
  'The lift\'s point is no move');
assert.match(press, /if \(edge == swipe_gestures::kEdgeOff && !page_swipe\) \{\s*if \(!self->touch_watched\) return;/);
assert.match(press, /self->access_gesture_action = edge != swipe_gestures::kEdgeOff \? actions\[edge\] : kPageSwipe;/);
assert.match(bar, /lv_obj_set_user_data\(button, &g_button_marker\);/, 'The gear and the X are marked');
const motion = slice(manager, 'void UIManager::processSettingsGestureMotion(', '\n}\n');
assert.match(motion, /if \(!matches\) \{\s*if \(access_page_swipe && abs_dx >= threshold && abs_dx > abs_dy\) \{\s*processPageSwipeMotion\(input, released\);/);
assert.match(read('src/tiles/runtime/level_bar.h'), /lv_obj_remove_flag\(bar, LV_OBJ_FLAG_GESTURE_BUBBLE\);/,
  'The level bar keeps its drags');
const swipe = slice(manager, 'void UIManager::processPageSwipeMotion(', '\n}\n');
// One swipe, one step: past the threshold the page turns while the finger
// is still down (user 2026-10-12: it snaps at once, step by step).
assert.match(swipe, /abs_dx < kSettingsGestureThreshold \|\| abs_dx <= abs_dy/);
assert.match(swipe, /if \(!released\) lv_indev_wait_release\(input\);\s*lv_indev_reset\(input, nullptr\);\s*(?:\/\/[^\n]*\n\s*)*turnPage\(dx < 0 \? 1 : -1\);/);
assert.doesNotMatch(manager, /page_drag_tick/);
const showPage = slice(manager, 'void UIManager::openPage(int number) {', '\n}\n');
assert.match(showPage, /if \(number < 0 \|\| number > count\) return;/);
assert.match(showPage, /requestFolderAccess\(folder_id, folder->name, folder->icon_name\);/, 'A lock set anyway still asks');

// /api/pages: head bar only, Home folders, six at most, a lock removed only
// after the browser asked, the tile off Home in both bar layouts, a folder
// taken out placed on the shown grid (or nothing changes).
const handler = slice(read('src/web/server/handlers/web_admin_tiles.cpp'), 'void WebAdminServer::handleSavePages() {', '\nvoid WebAdminServer::handleGetFolderTab');
assert.match(handler, /if \(grid_layout::active\(\) == grid_layout::Layout::kClassic\) \{\s*sendJsonError\(server, 409, "Pages need the head bar"\);/);
// The slots and the lock are checked like the layout window's save does
// (checkPageSlots, lockedNewPage).
const tilesSource = read('src/web/server/handlers/web_admin_tiles.cpp');
const slotCheck = slice(tilesSource, 'const char* checkPageSlots(', '\n}\n');
assert.match(slotCheck, /tileConfig\.getFolderParent\(id\) != TileConfig::rootFolderId\(\)/);
assert.match(slotCheck, /if \(slots\.size\(\) > tile_layouts::kMaxPages\) return "Too many pages";/);
assert.match(handler, /if \(const char\* error = checkPageSlots\(wanted\)\) \{/);
assert.match(slice(tilesSource, 'uint16_t lockedNewPage(', '\n}\n'),
  /if \(unlock\) return 0;[\s\S]*?tileConfig\.isFolderPinEnabled\(id\)\) \{\s*return id;/);
assert.match(handler, /if \(const uint16_t locked = lockedNewPage\(wanted, before, before_count, server\.arg\("unlock"\) == "1"\)\) \{\s*server\.send\(409/);
assert.match(handler, /tile_layouts::remove\(grid_layout::Layout::kBar, TileConfig::rootFolderId\(\), tile->view_id\);\s*tile_layouts::remove\(grid_layout::Layout::kPortrait, TileConfig::rootFolderId\(\), tile->view_id\);/);
const noRoom = handler.indexOf('sendJsonError(server, 409, "No free cell");');
const firstWrite = handler.indexOf('tileConfig.clearFolderPin(id)');
assert.ok(noRoom >= 0 && firstWrite > noRoom, 'Room is checked before anything is written');
assert.match(read('src/web/server/web_admin.cpp'), /server\.on\("\/api\/pages", HTTP_POST,/);
// The layout window may leave a page's folder tile off Home.
assert.match(read('src/web/server/handlers/web_admin_tiles.cpp'),
  /if \(pages && std::find\(pages->begin\(\), pages->end\(\), getNavigateTargetId\(tile\)\) != pages->end\(\)\) continue;/);

// The preview card: a tap on the head's dots; its dot row lies exactly on
// the head's (same row, same x, same y), the pictures from the built grids'
// card colors, no dimming (the catcher is never drawn), the popups' cached
// shadow, closed by every navigation and a theme change.
assert.match(bar, /lv_obj_add_event_cb\(dots, dots_event, LV_EVENT_RELEASED, nullptr\);/);
const preview = read('src/ui/tabs/tiles/page_preview.cpp');
// Its top on the head circle's top line, its dots in a band as high as
// the circle (user 2026-10-12).
assert.match(preview, /const int card_y = head\.center_y - head\.disc \/ 2;/);
assert.match(preview, /const int card_h = head\.disc \+ rows \* cell_h/);
// The shown page's cell filled like a pressed one, a pressed one the same;
// every name in the text color.
assert.match(preview, /lv_obj_set_style_bg_opa\(cell, i == current \? LV_OPA_COVER : LV_OPA_TRANSP, 0\);\s*lv_obj_set_style_bg_opa\(cell, LV_OPA_COVER, LV_STATE_PRESSED\);/);
assert.match(preview, /tone_color::pressed_card\(ui_theme::popup_card\(\)\)/);
assert.match(preview, /lv_obj_set_style_text_color\(name, lv_color_hex\(ui_theme::text\(\)\), 0\);/);
// The overview's fixed rules for every panel (user 2026-10-12, mockup
// build/design-mockups/pages/dots-swipe.html).
const rules = slice(preview, 'Geometry geometry() {', '\n}\n');
assert.match(rules, /g\.pic_w = static_cast<int>\(std::lround\(side \* 0\.22f\)\);/, 'A picture: 22 % of the short side');
assert.match(rules, /g\.gap = std::max\(3, static_cast<int>\(std::lround\(2\.0f \* GRID_GAP \* g\.pic_w \/ w\)\)\);/);
assert.match(rules, /g\.tile_radius = std::max\(2, static_cast<int>\(std::lround\(\(g\.cell_h - g\.gap\) \/ 4\.0f\)\)\);/, 'The panel\'s tile corner rule');
assert.match(rules, /g\.pic_radius = g\.tile_radius \+ g\.gap;/);
assert.match(rules, /g\.card_radius = popup_layout::kCardRadius \+ Device::kGridGap;\s*g\.pad = std::max\(g\.gap, g\.card_radius - g\.pic_radius\);/, 'Concentric with the popup corner');
assert.match(rules, /g\.font = tile_layout::header_title_font\(\);/);
assert.match(preview, /ui_surface_style::apply_popup_border\(card, lv_color_hex\(ui_theme::text\(\)\),/, 'The popup hairline');
// A tap on a picture shows its page (a finger that moved taps nothing,
// ui_manager.cpp); any lift beside the pictures closes it (user 2026-10-13:
// a tap that moved a little did not close it at once).
assert.doesNotMatch(preview, /was_tap|remember_press/);
assert.match(preview, /void on_close\(lv_event_t\*\) \{ close\(\); \}/);
assert.match(preview, /tappable\(g_state\.catcher, on_close, nullptr, LV_EVENT_RELEASED\);/);
assert.match(preview, /tappable\(card, on_close, nullptr, LV_EVENT_RELEASED\);/, 'Its free parts close it too');
assert.match(preview, /tappable\(cell, on_picture, reinterpret_cast<void\*>\(static_cast<intptr_t>\(i\)\), LV_EVENT_CLICKED\);\s*g_state\.cells\[i\] = cell;/);
// The finger of a hold picks a page: the cell under it lights up like a
// pressed one, lifting there shows it, lifted beside them it stays open.
assert.match(preview, /if \(i == under\) lv_obj_add_state\(g_state\.cells\[i\], LV_STATE_PRESSED\);/);
assert.match(preview, /void lift_at\(const lv_point_t& point\) \{\s*const int under = cell_at\(point\);\s*point_at\(\{-1, -1\}\);\s*if \(under < 0\) return;\s*close\(\);\s*uiManager\.showPage\(under\);/);
assert.doesNotMatch(preview, /bar_w|bar_h/, 'No bar under the shown page\'s name');
assert.match(preview, /home_bar::create_dots\(card, count, current, \(grid_layout::screen_w\(\) - dots_w\) \/ 2 - card_x,\s*head\.center_y - dot\.dot \/ 2 - card_y\);/);
// The head's row sits where the card's does; its pill as high as the
// head's circle, as much beside; a tap reaches it 20 px around.
assert.match(build, /const int row_x = \(grid_layout::screen_w\(\) - dots_width\(count\)\) \/ 2;[\s\S]{0,400}?const int pad = \(g\.disc - d\.dot\) \/ 2;\s*const int box_h = d\.dot \+ 2 \* pad;\s*lv_obj_t\* dots = create_dots\(bar, count, page, row_x - pad, g\.center_y - box_h \/ 2\);/,
  'The head and the card build the same row');
assert.match(build, /lv_obj_set_ext_click_area\(dots, \(20 \* side \+ 400\) \/ 800\);/);
assert.match(build, /lv_obj_set_style_bg_opa\(dots, 31, LV_STATE_USER_1\);/);
assert.doesNotMatch(preview, /lv_obj_set_style_bg_opa\(g_state\.catcher/, 'No dimming');
assert.match(preview, /popup_layout::apply_card_shadow\(card\);/);
assert.match(preview, /lv_obj_add_event_cb\(picture, picture_draw, LV_EVENT_DRAW_MAIN_END, nullptr\);/, 'Pictures are drawn, not built of objects');
assert.match(preview, /close\(\);\s*uiManager\.showPage\(index\);/);
// The pictures' tiles (page_schematic_from, test-page-pictures.mjs).
const schematic = slice(tiles, 'static size_t page_schematic_from(', '\n}\n');
assert.match(schematic, /color = lv_color_to_u32\(lv_obj_get_style_bg_color\(obj, LV_PART_MAIN\)\) & 0xFFFFFF;/);
assert.match(schematic, /if \(lv_obj_get_style_bg_opa\(obj, LV_PART_MAIN\) < LV_OPA_50\) continue;/);
// Another tab closes it; a page turn keeps it open, marking the new page
// (user 2026-10-13: swiping turns, tapping decides), any other folder
// closes it.
assert.match(slice(manager, 'void UIManager::switchToTab(uint8_t index) {', '\n}\n'), /if \(index != active_tab_index\) page_preview::close\(\);/);
assert.match(slice(manager, 'void UIManager::processThemeChange() {', '\n}\n'), /viewNavigationClosePopups\(\);\s*page_preview::close\(\);/);
assert.match(slice(tiles, 'void tiles_switch_to_folder(uint16_t folder_id) {', '\n}\n'), /page_preview::follow\(folder_id\);/);
const follow = slice(preview, 'void follow(uint16_t folder_id) {', '\n}\n');
assert.match(follow, /if \(page < 0 \|\| page >= g_state\.count\) \{\s*close\(\);\s*return;\s*\}/);
// At rest on the shown page whatever moved before (user 2026-10-13: the
// head's glide took the one line motion over, the overview's line kept the
// old page while the new one was marked).
assert.match(follow, /\/\/[^\n]*\n\s*home_bar::glide\(g_state\.card_dots, page, page, 0\);\s*mark\(page\);\s*$/);
assert.doesNotMatch(follow, /page != g_state\.current/);
// Untouched for 10 s it closes by itself (user 2026-10-13); its timer goes
// with it.
assert.match(preview, /constexpr uint32_t kIdleCloseMs = 10000;/);
assert.match(preview, /void close_when_idle\(lv_timer_t\*\) \{\s*if \(lv_display_get_inactive_time\(nullptr\) >= kIdleCloseMs\) close\(\);/);
assert.match(preview, /g_state\.idle = lv_timer_create\(close_when_idle, 500, nullptr\);/);
assert.match(preview, /void close\(\) \{\s*if \(g_state\.idle\) lv_timer_delete\(g_state\.idle\);\s*g_state\.idle = nullptr;/);
// Over the open overview only its own line glides (one line moves at a time).
assert.match(slice(manager, 'void UIManager::showPage(int number) {', '\n}\n'),
  /openPage\(number\);[\s\S]*if \(current >= 0 && page_preview::is_open\(\)\) page_preview::lead\(current, number, kPageLeadMs\);/);
assert.match(preview, /if \(g_state\.cells\[i\]\) lv_obj_set_style_bg_opa\(g_state\.cells\[i\], i == page \? LV_OPA_COVER : LV_OPA_TRANSP, 0\);/);
// A press shows once the finger rested 100 ms within a tap's distance (user
// 2026-10-13: tiles and dots showed it at the start of every swipe; Android
// waits its tap timeout, iOS delays content touches): the input holds the
// object's press back, the PRESSING after the rest gives it, a finger that
// went further takes it away; a tap lifted before shows it a moment.
assert.match(read('src/ui/shared/touch_rules.h'), /constexpr uint32_t kPressDelayMs = 70;[\s\S]*constexpr uint32_t kTapFlashMs = 90;/);
assert.match(press, /if \(self->touch_watched && !home_bar::is_dots\(pressed_object\)\) \{\s*lv_indev_stop_processing\(input\);\s*self->touch_press_obj = pressed_object;\s*self->touch_press_ms = lv_tick_get\(\);/);
const pressShow = slice(manager, 'void UIManager::updateTouchPress(lv_indev_t* input) {', '\n}\n');
// A press a swipe took over goes at once (tile_press.h; its fade back glowed
// along every swipe, user 2026-10-13).
assert.match(pressShow, /if \(touch_moved\) \{\s*\/\/[^\n]*\n\s*if \(touch_press_shown\) tile_press::off_at_once\(obj\);\s*touch_press_obj = nullptr;\s*return;\s*\}/);
assert.match(pressShow, /lv_tick_elaps\(touch_press_ms\) >= touch_rules::kPressDelayMs\) \{\s*touch_press_shown = true;\s*lv_obj_send_event\(obj, LV_EVENT_PRESSED, input\);/);
assert.match(press, /if \(released && released == self->touch_press_obj && !self->touch_press_shown && !self->touch_moved\) \{\s*self->touch_press_shown = true;\s*self->touch_press_late = true;\s*lv_obj_send_event\(released, LV_EVENT_PRESSED, input\);/);
assert.match(press, /flash_tap\(static_cast<lv_obj_t\*>\(lv_event_get_param\(event\)\)\);/);
assert.match(slice(manager, 'static void flash_tap(lv_obj_t* obj) {', '\n}\n'),
  /lv_obj_add_event_cb\(obj, tap_flash_forget, LV_EVENT_DELETE, nullptr\);\s*lv_obj_add_state\(obj, LV_STATE_PRESSED\);\s*g_tap_flash_timer = lv_timer_create\(tap_flash_done, touch_rules::kTapFlashMs, nullptr\);/);

// No folder is ever out of reach (user 2026-10-12): a layout where folder
// tiles have no place is not switched to, on the Web Admin (with the hint)
// nor in the setup; a page's tile needs none in the bar layouts.
const without = slice(tileConfig, 'unsigned TileConfig::foldersWithoutPlace(', '\n}\n');
assert.match(without, /if \(tile_layouts::classic_hidden\(folder\.id, tile\.view_id\)\) \+\+missing;/);
assert.match(without, /if \(folder\.id == kRootFolderId && tile_layouts::page_number\(getNavigateTargetId\(tile\)\) > 0\) continue;/);
assert.match(without, /!grid_layout::inside\(screen, place\.col, place\.row, place\.span_w, place\.span_h\)/);
const switchLayout = slice(read('src/web/server/handlers/web_admin_tiles.cpp'), 'void WebAdminServer::handleSwitchLayout() {', '\n}\n');
assert.ok(switchLayout.indexOf('tileConfig.foldersWithoutPlace(layout)') < switchLayout.indexOf('configManager.saveLayout('),
  'Checked before the layout is stored');
assert.match(switchLayout, /snprintf\(message, sizeof\(message\), tr\.layout_switch_refused, missing, tr\.layout_change\);/);
const setup = slice(read('src/ui/tabs/settings/tab_settings.cpp'), 'void layout_selected(uint8_t index) {', '\n}\n');
assert.ok(setup.indexOf('tileConfig.foldersWithoutPlace(layout)') < setup.indexOf('configManager.saveLayout('));
assert.match(read('src/web/admin/tiles/layout-window.js'), /showNotification\(error\?\.message \|\| t\('saveFailed'\), false\);/,
  'The window shows the device\'s reason');

// Every language has the page texts and the refusal (positional tables).
const i18n = read('src/core/i18n/i18n.cpp');
for (const [table, words] of Object.entries({
  kStringsDe: ['"Seiten"', '"Seiten gespeichert"', '"%u Ordner haben in diesem Layout keinen Platz.', '"Seiten haben keine PIN."'],
  kStringsEn: ['"Pages"', '"Pages saved"', '"%u folders have no place in this layout.', '"Pages have no PIN."'],
  kStringsFr: ['"Pages"', '"Pages enregistrées"', '"%u dossiers n\'ont pas de place', '"Les pages n\'ont pas de code PIN."'],
  kStringsPl: ['"Strony"', '"Zapisano strony"', '"Foldery bez miejsca w tym układzie: %u.', '"Strony nie mają kodu PIN."']})) {
  const start = i18n.indexOf(`static const Strings ${table} = {`);
  const body = i18n.slice(start, i18n.indexOf('};', start));
  for (const word of words) assert.ok(body.includes(word), `${table} ${word}`);
  // The refusal: one count and one button name.
  const refusal = body.slice(body.indexOf('"%u') >= 0 ? body.indexOf('"%u') : body.indexOf('"Foldery bez'));
  const refusalLine = refusal.slice(0, refusal.indexOf('\n'));
  assert.ok((refusalLine.match(/%u/g) || []).length === 1 && (refusalLine.match(/%s/g) || []).length === 1, `${table}: %u and %s`);
}
const scripts = read('src/web/server/render/web_admin_scripts.cpp');
for (const key of ['pageUnlockConfirm', 'pagesSaved']) assert.ok(scripts.includes(`appendJsEntry("${key}"`), key);

// A page has no PIN: refused by the device, no PIN option in the editor.
const access = slice(read('src/web/server/handlers/web_admin_tiles.cpp'), 'void WebAdminServer::handleSaveFolderAccess() {', '\n}\n');
assert.match(access, /if \(enable && tile_layouts::page_number\(folder_id\) > 0\) \{\s*sendError\(409, tr\.folder_pin_page\);/);
assert.match(read('src/types/navigate/admin.js'), /if \(fields\) fields\.classList\.toggle\('is-hidden', !isFolderTile \|\| isPage\);/);
// The card's dots close it like the head's.
assert.match(preview, /tappable\(card_dots, on_close, nullptr, LV_EVENT_RELEASED\);/);
// A page change shows before the flash write and keeps the prepared grids
// (user 2026-10-12: dragging in or out took long, every page was built
// again): their heads are built again, Home's tiles move without a rebuild.
assert.ok(handler.indexOf('tiles_rebuild_heads(awake);') > handler.indexOf('tile_layouts::set_pages(') &&
          handler.indexOf('tiles_show_active_layout_now()') > handler.indexOf('tiles_rebuild_heads(awake);') &&
          handler.indexOf('tile_layouts::commit()') > handler.indexOf('tiles_show_active_layout_now()'),
          'Shown first, written after');
assert.doesNotMatch(handler, /tiles_invalidate_folder\(/, 'No prepared grid is dropped');
assert.match(handler, /if \(Tile\* tile = id \? folder_tile\(id\) : nullptr\) tile->layout_hidden = true;/);
const tabs = read('src/ui/tabs/tiles/tab_tiles_unified.cpp');
assert.match(slice(tabs, 'void tiles_rebuild_heads(bool draw_now) {', '\n}\n'), /home_bar::rebuild\(entry\.grid, entry\.folder_id\);/);
assert.match(slice(bar, 'void rebuild(lv_obj_t* grid, uint16_t folder_id) {', '\n}\n'), /if \(is_bar\(child\)\) lv_obj_delete\(child\);[\s\S]*build\(grid, folder_id\);/);

// The Web Admin (user 2026-10-13): the page fields and the Settings field
// are cells of Home's grid (page-fields.js; its behaviour in
// test-page-fields.mjs), no boxes of their own, nothing made smaller.
const markup = read('src/web/server/render/web_admin_html.cpp');
assert.ok(markup.indexOf('id=\\"pageSlots\\"') > markup.indexOf('<!-- Grid Preview -->'), "The fields' markup after the preview");
assert.ok(markup.indexOf('id=\\"pageSlots\\"') < markup.indexOf('id=\\"settingsHiddenSlot\\"'), 'Before the Settings field');
assert.match(markup, /if \(!page_fields\) \{\s*html \+= "<div class=\\"settings-parking-texts/);
assert.match(markup, /html \+= "\\"><div class=\\"page-fields-label\\">";\s*appendHtmlEscaped\(html, tr\.pages_title\);/, 'One word over the page fields');
assert.match(markup, /html \+= "<div class=\\"page-field\\" data-slot=\\"" \+ String\(i\) \+ "\\"><\/div>";/);
assert.match(markup, /if \(page_fields\) html \+= " data-in-grid=\\"1\\"";/);
assert.match(markup, /if \(grid_layout::head_bar\(\)\) html \+= " with-page-fields";/);
assert.match(markup, /static bool previewSlotsBeside\(\) \{\s*return grid_layout::screen_w\(\) <= grid_layout::screen_h\(\);\s*\}/);
assert.doesNotMatch(markup, /page-stack|page-group|page-settings|pageSlotsUnder/);
const css = read('src/web/assets/admin.css');
assert.doesNotMatch(css, /page-stack|page-group|page-settings|slot-zoom|stack-zoom|page-slots-under/);
assert.doesNotMatch(read('src/web/server/render/web_admin_styles.cpp'), /slot-zoom/);
assert.match(css, /\.tile-grid\.has-page-fields \{[\s\S]*?padding-right:calc\(var\(--preview-pad-right, var\(--preview-pad\)\) \+ var\(--fields-right, 0px\)\);/,
  "The fields take their room as the grid's padding: its pointer mapping stays");
assert.match(css, /\.tile-grid > \.page-field,\s*\.tile-grid > \.tile-grid\.settings-hidden-slot \{[\s\S]*?width:var\(--preview-cell-w\);\s*height:var\(--preview-cell-h\);/,
  "A field is a tile's size");
assert.match(markup, /if \(previewSlotsBeside\(\)\) html \+= " compact-grid";/);

// A tap beside the dots turns one page to that side, in the head and in the
// overview (user 2026-10-14, like the iPhone's page dots); on the dots the
// overview as before.
{
  const head = read('src/ui/tabs/tiles/home_bar.cpp');
  assert.match(head, /void step_event\(lv_event_t\* event\) \{\s*const int step = static_cast<int>\(reinterpret_cast<intptr_t>\(lv_event_get_user_data\(event\)\)\);\s*const int page = tile_layouts::page_number\(tileConfig\.getActiveFolderId\(\)\);\s*if \(page >= 0\) uiManager\.showPage\(page \+ step\);/);
  // Two head circles wide over the whole head (user 2026-10-14: one circle
  // had to be hit exactly), never over the gear's touch area.
  assert.match(head, /int step_zone_width\(\) \{ return 2 \* popup_layout::kHeaderIconDiscSize; \}/);
  assert.match(head, /const int gear_left = gear_hidden \? grid_layout::screen_w\(\) : g\.close_x - popup_layout::kCloseButtonClickArea;\s*for \(const int step : \{-1, 1\}\) \{\s*if \(page \+ step < 0 \|\| page \+ step >= count\) continue;\s*const int x = step < 0 \? row_x - pad - step_zone_width\(\) : row_x \+ dots_width\(count\) \+ pad;\s*const int w = step < 0 \? step_zone_width\(\) : LV_MIN\(step_zone_width\(\), gear_left - x\);\s*if \(w <= 0\) continue;\s*lv_obj_t\* zone = plain\(bar\);\s*lv_obj_set_size\(zone, w, GRID_PAD_TOP\);\s*lv_obj_set_pos\(zone, x, 0\);[\s\S]{0,120}lv_obj_add_event_cb\(zone, step_event, LV_EVENT_CLICKED,/,
    'Beside the pill, one side each, only where a page lies');
  const preview = read('src/ui/tabs/tiles/page_preview.cpp');
  assert.match(preview, /void on_step\(lv_event_t\* event\) \{\s*const int to = g_state\.current \+ static_cast<int>\(reinterpret_cast<intptr_t>\(lv_event_get_user_data\(event\)\)\);\s*if \(to >= 0 && to < g_state\.count\) uiManager\.showPage\(to\);/,
    'The overview stays open, showPage leads its line');
  assert.match(preview, /lv_obj_set_ext_click_area\(card_dots, geo\.pad\);[\s\S]{0,200}const int dots_x = \(grid_layout::screen_w\(\) - dots_w\) \/ 2 - card_x;\s*for \(const int step : \{-1, 1\}\) \{\s*const int x = step < 0 \? LV_MAX\(0, dots_x - home_bar::step_zone_width\(\)\) : dots_x \+ dots_w;\s*const int w = step < 0 \? dots_x - x : LV_MIN\(home_bar::step_zone_width\(\), card_w - x\);[\s\S]{0,200}tappable\(zone, on_step,/,
    'Its zones over the dots touch margin beside them (made after them)');
}
console.log('Head bar pages: storage, dots, swipe, preload, preview card, /api/pages, no PIN, no folder out of reach');
