#pragma once

// The MDI icon font keeps its glyph descriptors and character map in the
// firmware, but only the bitmaps of the built-in core icons
// (tools/icons/core-icons.txt). The other bitmaps come from the icon file
// (tools/generate-icon-files.mjs) through LVGL's on-demand glyph loader: the
// font's glyph_bitmap points to an mdi_icon_loader_t, and mdi_icon_cache.cpp
// serves each bitmap from the core set, its cache or the file.
// Shared by the generated C fonts (src/fonts/mdi_icons_<px>.c) and C++.

#include <stdbool.h>
#include <stdint.h>

#include "lvgl.h"
#include <lvgl_private.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct mdi_icon_font_data_t {
  uint16_t px;
  uint32_t glyph_count;    // reserved glyph 0 included
  uint32_t bitmap_bytes;   // all glyph bitmaps, the icon file's payload
  uint32_t table_crc;      // CRC32 of the glyph descriptors, named in the file header
  const lv_font_fmt_txt_glyph_dsc_t* glyph_dsc;
  uint32_t core_count;
  const uint16_t* core_ids;      // ascending glyph ids of the built-in icons
  const uint32_t* core_offsets;  // core_count + 1 offsets into core_bitmap
  const uint8_t* core_bitmap;
} mdi_icon_font_data_t;

typedef struct mdi_icon_loader_t {
  lv_font_fmt_txt_glyph_loader_t base;  // first: LVGL casts glyph_bitmap to it
  const mdi_icon_font_data_t* data;
  void* cache;                          // mdi_icon_cache's state, NULL before attach
} mdi_icon_loader_t;

// LVGL glyph loader callback: the raw (compressed) bitmap of glyph `gid`.
const uint8_t* mdi_icon_loader_bitmap(lv_font_fmt_txt_glyph_loader_t* loader, uint32_t gid);

// The font's get_glyph_dsc: a glyph whose bitmap the panel cannot load (no
// icon file and not built in) is drawn as the unknown-name icon instead.
bool mdi_icon_loader_glyph_dsc(const lv_font_t* font, lv_font_glyph_dsc_t* dsc_out,
                               uint32_t letter, uint32_t letter_next);

#ifdef __cplusplus
}  // extern "C"
#endif
