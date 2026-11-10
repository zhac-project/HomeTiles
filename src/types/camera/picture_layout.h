#pragma once

#include <stddef.h>
#include <stdint.h>

// The pure parts of a Camera tile showing a picture (picture.h), run by
// tools/tests/tiles/test-camera-picture-head.mjs.
namespace camera_picture_layout {

// The head (user 2026-10-11, build/design-mockups/camera-tile #tile): the
// circle in the top-left corner like the Sensor tile's, the title on a pill
// mirrored into the top-right corner (same height, inset and corner
// rounding, colored like the circle). When less than one grid gap would stay
// free between them, or the title does not fit its pill, circle and title
// share one pill across the head: the icon at its left end, the title
// right-aligned where it was. The Web Admin preview uses the same rule
// (cameraPictureHead).
struct Head {
  bool shared = false;
  int pill_x = 0;  // the pill's box in card coordinates, before the corner shrink
  int pill_w = 0;
  int text_x = 0;  // the title's box in card coordinates
  int text_w = 0;
};

// card_w: the card's width. inset: the circle box's distance to the card's
// edges. disc: the circle box's side. shrink: the corner shrink on every side
// (tile_icon_disc::corner_shrink: the visible circle is the box minus it).
// pad: the title's distance to the visible end of its pill. gap: one grid
// gap. text: the title's width in its font.
inline Head head(int card_w, int inset, int disc, int shrink, int pad, int gap, int text) {
  Head out;
  if (text < 0) text = 0;
  const int box_w = text + 2 * (pad + shrink);
  const int pill_x = card_w - inset - box_w;
  const int circle_right = inset + disc - shrink;
  if (pill_x + shrink - circle_right >= gap) {
    out.pill_x = pill_x;
    out.pill_w = box_w;
    out.text_x = pill_x + shrink + pad;
    out.text_w = text;
    return out;
  }
  out.shared = true;
  out.pill_x = inset;
  out.pill_w = card_w - 2 * inset;
  out.text_x = inset + disc;
  out.text_w = card_w - inset - shrink - pad - out.text_x;
  if (out.text_w < 0) out.text_w = 0;
  return out;
}

// The next Unicode code point of UTF-8 `text` at `i` (advanced past it); 0 at
// the end. A broken sequence counts as one byte.
inline uint32_t next_codepoint(const char* text, size_t& i) {
  const unsigned char first = static_cast<unsigned char>(text[i]);
  if (!first) return 0;
  int extra = first >= 0xF0 ? 3 : first >= 0xE0 ? 2 : first >= 0xC0 ? 1 : 0;
  uint32_t code = extra == 3 ? (first & 0x07u) : extra == 2 ? (first & 0x0Fu) : extra == 1 ? (first & 0x1Fu) : first;
  ++i;
  for (; extra > 0; --extra) {
    const unsigned char next = static_cast<unsigned char>(text[i]);
    if ((next & 0xC0) != 0x80) return first;
    code = (code << 6) | (next & 0x3Fu);
    ++i;
  }
  return code;
}

// The title's width for the head rule: its glyphs' whole-pixel advances
// without kerning, `advance(code point)`. The Web Admin preview adds the same
// advances (CAMERA_TILE_LAYOUT.adv), so panel and preview choose the same
// head; the label itself is laid out with kerning inside the pill.
template <typename Advance>
inline int title_metric(const char* text, Advance advance) {
  int width = 0;
  size_t i = 0;
  if (!text) return 0;
  while (const uint32_t code = next_codepoint(text, i)) width += advance(code == '\n' ? ' ' : code);
  return width;
}

// Native RGB565 of an RGB color.
inline uint16_t rgb565(uint32_t rgb) {
  return static_cast<uint16_t>(((rgb >> 8) & 0xF800) | ((rgb >> 5) & 0x07E0) | ((rgb >> 3) & 0x001F));
}

// `over` drawn with coverage/16 over `under` (native RGB565).
inline uint16_t blend565(uint16_t over, uint16_t under, uint8_t coverage) {
  if (coverage >= 16) return over;
  if (coverage == 0) return under;
  const uint32_t r = (((over >> 11) & 0x1F) * coverage + ((under >> 11) & 0x1F) * (16 - coverage) + 8) / 16;
  const uint32_t g = (((over >> 5) & 0x3F) * coverage + ((under >> 5) & 0x3F) * (16 - coverage) + 8) / 16;
  const uint32_t b = ((over & 0x1F) * coverage + (under & 0x1F) * (16 - coverage) + 8) / 16;
  return static_cast<uint16_t>((r << 11) | (g << 5) | b);
}

// Rounds the corners of a native RGB565 picture of w x h towards `under` (the
// color behind the card), like the screensaver does towards black. The
// picture covers its whole card, so it carries the card's corner itself and
// needs no clipping layer. `coverage(x, y, w, h, radius)` gives 0..16
// (wallpaper_cover::rounded_pixel_coverage); only corner pixels are visited.
template <typename Coverage>
inline void round_corners(uint16_t* pixels, uint16_t w, uint16_t h, uint16_t radius, uint16_t under,
                          Coverage coverage) {
  if (!pixels || radius == 0 || w < 2 * radius || h < 2 * radius) return;
  for (uint16_t y = 0; y < h; ++y) {
    if (y >= radius && y < h - radius) {
      y = static_cast<uint16_t>(h - radius - 1);
      continue;
    }
    uint16_t* row = pixels + static_cast<uint32_t>(y) * w;
    for (uint16_t x = 0; x < radius; ++x) {
      row[x] = blend565(row[x], under, coverage(x, y, w, h, radius));
      const uint16_t right = static_cast<uint16_t>(w - 1 - x);
      row[right] = blend565(row[right], under, coverage(right, y, w, h, radius));
    }
  }
}

// The corners of a picture rounded towards `old_under` turned towards
// `new_under` instead (the color behind the card changed, e.g. the theme):
// each corner pixel's own color is recovered from its old blend.
template <typename Coverage>
inline void reround_corners(uint16_t* pixels, uint16_t w, uint16_t h, uint16_t radius, uint16_t old_under,
                            uint16_t new_under, Coverage coverage) {
  if (!pixels || old_under == new_under || radius == 0 || w < 2 * radius || h < 2 * radius) return;
  auto unblend = [](int value, int under, int c, int max) {
    const int own = (value * 16 - under * (16 - c) + c / 2) / c;
    return own < 0 ? 0 : own > max ? max : own;
  };
  auto turn = [&](uint16_t& px, uint8_t c) {
    if (c >= 16) return;
    if (c == 0) {
      px = new_under;
      return;
    }
    const int r = unblend((px >> 11) & 0x1F, (old_under >> 11) & 0x1F, c, 0x1F);
    const int g = unblend((px >> 5) & 0x3F, (old_under >> 5) & 0x3F, c, 0x3F);
    const int b = unblend(px & 0x1F, old_under & 0x1F, c, 0x1F);
    px = blend565(static_cast<uint16_t>((r << 11) | (g << 5) | b), new_under, c);
  };
  for (uint16_t y = 0; y < h; ++y) {
    if (y >= radius && y < h - radius) {
      y = static_cast<uint16_t>(h - radius - 1);
      continue;
    }
    uint16_t* row = pixels + static_cast<uint32_t>(y) * w;
    for (uint16_t x = 0; x < radius; ++x) {
      turn(row[x], coverage(x, y, w, h, radius));
      const uint16_t right = static_cast<uint16_t>(w - 1 - x);
      turn(row[right], coverage(right, y, w, h, radius));
    }
  }
}

}  // namespace camera_picture_layout
