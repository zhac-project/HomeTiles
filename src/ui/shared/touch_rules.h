#pragma once

#include <stdint.h>

#include "src/ui/popups/popup_layout.h"

// One touch, one meaning (user 2026-10-13: the page dots opened sometimes
// and sometimes not, a held finger lost the press pill; swipes must not
// cause false input): the same distances decide a tap, a hold and a swipe
// on Home and its pages.
namespace touch_rules {

// A finger that moved further is no tap: the tile under it gets no click and
// no long press, the press it showed goes (ui_manager.cpp).
constexpr int kTapSlop = popup_layout::scale(20);
// Sideways this far a swipe turns the page.
constexpr int kSwipeDistance = popup_layout::scale(48);
// A press shows once the finger has rested this long within kTapSlop (user
// 2026-10-13: the press showed at the start of every swipe; Android waits
// its tap timeout of about 100 ms, iOS delays content touches likewise; 100
// felt slow on the panel).
constexpr uint32_t kPressDelayMs = 70;
// A tap lifted before that shows its press this long after the lift.
constexpr uint32_t kTapFlashMs = 90;

// Whether a finger that moved dx, dy since it came down is no tap any more.
// Like a pager on a phone, only a move the way a swipe can start counts at
// kTapSlop: sideways where the page turns or a side edge's swipe is armed,
// up and down where a top or bottom edge's swipe is; any other way only
// beyond kSwipeDistance (user 2026-10-13: a tap on a page whose finger
// rolled 20 px down was swallowed, and a page has nothing that goes down).
constexpr bool far_from_tap(int dx, int dy, bool sideways, bool upright) {
  return (sideways && (dx > kTapSlop || -dx > kTapSlop)) ||
         (upright && (dy > kTapSlop || -dy > kTapSlop)) ||
         dx * dx + dy * dy > kSwipeDistance * kSwipeDistance;
}

}  // namespace touch_rules
