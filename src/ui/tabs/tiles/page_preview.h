#pragma once

#include <lvgl.h>
#include <stdint.h>

// The pages' preview (user 2026-10-12, mockup build/design-mockups/pages): a
// tap on the head's dots opens a small card right there, grown out of the
// dots (its dot row lies exactly on the head's), with a schematic picture of
// every page (its tiles as rectangles in their card colors, no text), three
// per row, the name under each and the current one marked like the active
// dot. A tap on a picture shows that page, a tap on its dots or beside it
// closes it; a sideways swipe over it turns the page and it stays open,
// marking the new one (ui_manager.cpp, user 2026-10-13: swiping turns,
// tapping decides); untouched for 10 s it closes by itself. No dimming and no
// animation (both cost whole-screen redraws); the popups' cached card shadow.
namespace page_preview {

// Opens over the head of the shown grid; `dots` (the head's dot row) hides
// while the card shows its own in the same place.
void open(lv_obj_t* dots);
void close();
bool is_open();
// A finger still down after the dots' hold opened it (home_bar.cpp): the
// page under it lights up like a pressed one, lifting there shows it;
// lifted beside the pictures the overview stays open.
void point_at(const lv_point_t& point);
void lift_at(const lv_point_t& point);
// A page turn while it is open: its line glides from page `from` to `to`
// instead of the head's hidden one (UIManager::showPage) and marks `to`;
// false when it is not open.
bool lead(int from, int to, uint32_t duration);
// The shown folder changed: a page is marked and it stays open, any other
// folder closes it (tiles_switch_to_folder).
void follow(uint16_t folder_id);
// The open card or the screen-wide catcher around it: an edge swipe that
// starts there still works and closes it (user 2026-10-12).
bool contains(lv_obj_t* obj);

}  // namespace page_preview
