#pragma once

#include <lvgl.h>

// Fixed-width digits for clocks (user 2026-10-11: the time shifted with every
// minute, Inter's digits are proportional). font() returns a copy of the
// font's descriptor whose digits 0-9 all take the widest digit's advance,
// each glyph centered in it, without kerning next to a digit; A and P before
// an M (AM / PM) take the wider one's advance the same way. No new glyphs:
// the copy draws the original bitmaps. The Web Admin preview mirrors it
// (types/clock/admin.js clockDigitsHtml).
namespace tabular_digits {

// The fixed-digit copy of `base` (kept for the run time); `base` itself when
// it is null or the copies are used up. Call it from the loop task (LVGL and
// the Web Admin run there): the first call for a font adds its copy.
const lv_font_t* font(const lv_font_t* base);

}  // namespace tabular_digits
