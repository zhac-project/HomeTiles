#pragma once

#include <lvgl.h>
#include <stdint.h>

// Analog clock faces for the clock tile (user 2026-10-12, chosen in
// build/design-mockups/clock: "Analog" and the wall clock of his photo): a
// round dial, twelve marks, the hour and minute hands. No second hand: the
// face redraws only when the minute changes.
namespace clock_face {

enum class Marks : uint8_t {
  // Twelve dots, the quarters larger and in the major color.
  kDots = 0,
  // Twelve slim batons (the wall clock).
  kBatons = 1,
};

struct Colors {
  uint32_t dial = 0;
  uint32_t major = 0;
  uint32_t minor = 0;
  uint32_t hour = 0;
  uint32_t minute = 0;
  uint32_t center = 0;
};

// The wall clock's colors (clock_tile::TileDateOptions dial / hands; the
// counts match clock_tile::kDialColorCount / kHandColorCount): slate, black,
// white, sage, navy, terracotta; gold, silver, black, white.
constexpr uint8_t kDialColorCount = 6;
constexpr uint32_t kDialColors[kDialColorCount] = {0x5E6C82, 0x1E1F22, 0xF4F4F2, 0x7C8C74, 0x26364F, 0xB86B4B};
constexpr uint8_t kHandColorCount = 4;
constexpr uint32_t kHandColors[kHandColorCount] = {0xC9A45C, 0xC3C7CC, 0x1A1A1A, 0xFFFFFF};

// A clock tile's face (clock/renderer.cpp clock_face_layout; the preview
// reads the scaled values as --clock-face-*, web_admin_styles.cpp), in
// tile_layout::scale units: its margin to the card, a half tile's smaller
// margin and the gap to the text beside it.
constexpr int kTileMargin = 16;
constexpr int kCompactMargin = 6;
constexpr int kCompactGap = 6;

// A face of `size` x `size` at (x, y) in `parent`, not clickable (a tap
// reaches the tile). `small` keeps only the quarter dots. It owns its
// one-second timer and releases it when deleted.
lv_obj_t* create(lv_obj_t* parent, lv_coord_t x, lv_coord_t y, lv_coord_t size, const Colors& colors, Marks marks,
                 bool small);

}  // namespace clock_face
