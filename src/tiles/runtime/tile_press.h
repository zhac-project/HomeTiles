#pragma once

#include <lvgl.h>

// A tile's press (user 2026-10-13). The input holds it back until the finger
// rested (touch_rules.h), so it shows at once then: the theme's fade in on
// top brought the full color only about 150 ms after the touch. Letting go
// fades back after the theme's delay like every button; a touch that became
// a swipe takes it away at once (its fade back from the full color glowed
// along every swipe that began slowly). The card (render_tile), its circles
// and resting controls (tile_icon_disc::fade_with_card) share these
// transitions.
namespace tile_press {

inline const lv_style_prop_t* props() {
  static const lv_style_prop_t kProps[] = {LV_STYLE_BG_COLOR, LV_STYLE_BG_OPA, static_cast<lv_style_prop_t>(0)};
  return kProps;
}

// Into the pressed state: at once.
inline lv_style_transition_dsc_t& in() {
  static lv_style_transition_dsc_t dsc;
  static bool ready = false;
  if (!ready) {
    lv_style_transition_dsc_init(&dsc, props(), lv_anim_path_linear, 0, 0, nullptr);
    ready = true;
  }
  return dsc;
}

// Back to rest: the theme's fade after its 70 ms delay (lv_theme_default.c).
inline lv_style_transition_dsc_t& back() {
  static lv_style_transition_dsc_t dsc;
  static bool ready = false;
  if (!ready) {
    lv_style_transition_dsc_init(&dsc, props(), lv_anim_path_linear, LV_THEME_DEFAULT_TRANSITION_TIME, 70, nullptr);
    ready = true;
  }
  return dsc;
}

inline lv_style_t& style_of(lv_style_transition_dsc_t& dsc) {
  static lv_style_t in_style, back_style;
  static bool ready = false;
  if (!ready) {
    lv_style_init(&in_style);
    lv_style_set_transition(&in_style, &in());
    lv_style_init(&back_style);
    lv_style_set_transition(&back_style, &back());
    ready = true;
  }
  return &dsc == &in() ? in_style : back_style;
}

// A card's, circle's or resting control's transitions in place of the
// theme's: the way back first, as LVGL puts a later style first, so the
// press's own transition wins when the press comes (as local styles the
// way back stood first and held the press three frames). Once only: a
// color refresh calls it again.
inline void apply(lv_obj_t* obj) {
  if (!obj) return;
  const lv_style_transition_dsc_t* now = lv_obj_get_style_transition(obj, LV_PART_MAIN);
  if (now == &in() || now == &back()) return;
  lv_obj_add_style(obj, &style_of(back()), LV_PART_MAIN | LV_STATE_DEFAULT);
  lv_obj_add_style(obj, &style_of(in()), LV_PART_MAIN | LV_STATE_PRESSED);
}

// A press a swipe took over goes at once, with the circles and controls
// that follow the card (they change state within its STATE_CHANGED, while
// back() is at once too: LVGL reads its time when the state changes).
inline void off_at_once(lv_obj_t* obj) {
  if (!obj) return;
  lv_style_transition_dsc_t& dsc = back();
  const uint32_t time = dsc.time;
  const uint32_t delay = dsc.delay;
  dsc.time = 0;
  dsc.delay = 0;
  lv_obj_remove_state(obj, LV_STATE_PRESSED);
  dsc.time = time;
  dsc.delay = delay;
}

}  // namespace tile_press
