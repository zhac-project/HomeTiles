#pragma once

#include <stdint.h>

// The Text tile's alignment (user 2026-10-12: "wie bei Word in alle
// Richtungen"): horizontal left, centered, right and vertical top, middle,
// bottom, kept in Tile::sensor_gauge_max (the Text tile never used it and
// stored 100): bits 11-12 horizontal (0 centered, 1 left, 2 right, like the
// clock's alignment), 13-14 vertical (0 middle, 1 top, 2 bottom). The low
// bits keep 100, so the value stays a valid gauge range (min 0) and a tile
// saved before reads centered and middle. The Web Admin sends it as
// text_options (types/text/admin.js packTextTileOptions).
namespace text_tile {

enum HAlign : uint8_t {
  H_CENTER = 0,
  H_LEFT = 1,
  H_RIGHT = 2,
};

enum VAlign : uint8_t {
  V_MIDDLE = 0,
  V_TOP = 1,
  V_BOTTOM = 2,
};

struct Options {
  uint8_t h = H_CENTER;
  uint8_t v = V_MIDDLE;
};

constexpr int32_t kBase = 100;

// A half-height Text tile's top and bottom padding (tile_layout::scale_480
// units); the preview reads it as --text-compact-pad-v.
constexpr int kCompactPadV480 = 6;

inline Options unpack(int32_t raw) {
  Options options;
  if (raw < 0) return options;
  const uint8_t h = static_cast<uint8_t>((raw >> 11) & 0x03);
  const uint8_t v = static_cast<uint8_t>((raw >> 13) & 0x03);
  options.h = h <= H_RIGHT ? h : H_CENTER;
  options.v = v <= V_BOTTOM ? v : V_MIDDLE;
  return options;
}

inline int32_t pack(const Options& options) {
  const uint8_t h = options.h <= H_RIGHT ? options.h : H_CENTER;
  const uint8_t v = options.v <= V_BOTTOM ? options.v : V_MIDDLE;
  return kBase | (static_cast<int32_t>(h) << 11) | (static_cast<int32_t>(v) << 13);
}

inline int32_t normalize(int32_t raw) { return pack(unpack(raw)); }

}  // namespace text_tile
