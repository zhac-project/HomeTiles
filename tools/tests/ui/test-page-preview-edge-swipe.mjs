// The pages' overview (page_preview.cpp) catches every touch on the screen
// so a tap beside the card closes it; the edge swipes saw no press on the
// tiles and did nothing while it was open (user 2026-10-12: a swipe from an
// edge must still work and simply close it, for every edge gesture).
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

// The card and its catcher are known as the overview's.
assert.match(read('src/ui/tabs/tiles/page_preview.h'), /bool contains\(lv_obj_t\* obj\);/);
assert.match(slice(read('src/ui/tabs/tiles/page_preview.cpp'), 'bool contains(lv_obj_t* obj) {', '\n}\n'),
  /for \(; obj && g_state\.catcher; obj = lv_obj_get_parent\(obj\)\) \{\s*if \(obj == g_state\.catcher\) return true;/);

const manager = read('src/ui/ui_manager.cpp');
// A press on it arms the edges and a sideways page turn like a press on the
// tiles (user 2026-10-13: it could not be swiped over); the top layer under
// it ends the search for a control that drags itself (a root has no gesture
// bubbling, every swipe over it was blocked).
const pressed = slice(manager, 'void UIManager::settings_gesture_indev_event_cb(lv_event_t* event) {', '\n}\n');
assert.match(pressed, /const bool over_preview = tab == 0 && page_preview::contains\(pressed_object\);\s*if \(!started_on_home && !over_preview\) return;/);
assert.match(pressed, /object && lv_obj_get_parent\(object\) && object != self->tab_panels\[tab\];/);
assert.doesNotMatch(pressed, /!over_preview &&/);
// A swipe that counts closes it before its action or page turn, after the
// touch was let go of (no tap on the card).
const edge = slice(manager, 'void UIManager::processSettingsGestureMotion(', '\n}\n');
assert.match(edge, /lv_indev_reset\(input, nullptr\);\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*page_preview::close\(\);\s*runSwipeAction\(access_gesture_action\);/);
// A sideways swipe turns the page and the overview stays open, marking the
// new one (user 2026-10-13: swiping turns, tapping decides).
const turn = slice(manager, 'void UIManager::processPageSwipeMotion(', '\n}\n');
assert.match(turn, /lv_indev_reset\(input, nullptr\);\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*turnPage\(dx < 0 \? 1 : -1\);/);
assert.doesNotMatch(turn, /page_preview::close\(\);/);
console.log('Pages overview: an edge swipe closes it, a sideways swipe turns the page under it');
