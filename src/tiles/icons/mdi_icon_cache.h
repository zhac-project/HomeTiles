#pragma once

// Bitmap cache of the MDI icon font (see mdi_icon_loader.h). One fixed block,
// allocated once, holds the cache state, a slot per glyph id and the cached
// bitmaps. A bitmap is read from the icon file the first time LVGL draws the
// glyph; when the block is full it is cleared and refilled by the following
// draws. Runs on the LVGL thread only (LV_USE_OS is LV_OS_NONE). Free of
// Arduino and ESP-IDF calls so host tests run the same code.

#include <stddef.h>
#include <stdint.h>

#include "src/tiles/icons/mdi_icon_loader.h"

namespace mdi_icon_cache {

constexpr uint32_t kHeaderBytes = 32;
constexpr uint16_t kFormat = 1;

// Reads `len` bitmap bytes starting `offset` bytes into the file's bitmaps.
struct Source {
  bool (*read)(void* ctx, uint32_t offset, uint8_t* out, uint32_t len);
  void* ctx;
};

struct Stats {
  uint32_t cached;
  uint32_t loads;
  uint32_t clears;
  uint32_t failures;
  uint32_t bitmap_used;
  uint32_t bitmap_capacity;
};

// Bytes of the cache block for a font: about 512 average glyphs.
size_t block_bytes(const mdi_icon_font_data_t& data);

// Uses `block` (block_bytes long) as the cache of `loader`, without a file
// until set_source. `unknown_codepoint` is drawn for glyphs it cannot load.
bool attach(mdi_icon_loader_t* loader, void* block, size_t bytes, uint32_t unknown_codepoint);

// Reads the bitmaps through `source` from now on (nullptr: no file); drops
// everything cached from a previous source.
void set_source(mdi_icon_loader_t* loader, const Source* source);

bool has_source(const mdi_icon_loader_t* loader);
Stats stats(const mdi_icon_loader_t* loader);

enum class HeaderCheck : uint8_t {
  Ok, Short, Magic, HeaderCrc, Format, PixelSize, GlyphCount, Length, Table,
};

// Checks an icon file header against the compiled font.
HeaderCheck check_header(const uint8_t* header, size_t header_len, uint32_t file_bytes,
                         const mdi_icon_font_data_t& data);
const char* header_check_text(HeaderCheck check);

// The bitmaps' CRC32 named in a checked header.
uint32_t header_bitmap_crc(const uint8_t* header);

// zlib CRC32, continued from `crc` (0 to start).
uint32_t crc32(uint32_t crc, const uint8_t* bytes, size_t len);

}  // namespace mdi_icon_cache
