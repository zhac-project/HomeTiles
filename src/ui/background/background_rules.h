#pragma once

// Pure rules for the background photo: which card files are listed, why a file
// can't be used, the stored settings, slider clamps, tile card opacity, and the
// one-time pixel work on the decoded photo. No Arduino or LVGL, so
// tools/tests/ui/test-background-rules.mjs compiles it on the host.

#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include "src/ui/background/jpeg_probe.h"

namespace background_rules {

constexpr size_t kMaxPhotoName = 64;  // bytes including NUL
constexpr size_t kMaxListed = 100;
constexpr uint32_t kMaxFileBytes = 8U * 1024U * 1024U;
// TJpgDec decodes every source pixel (LVGL builds it without scaling), so the
// source size bounds the decode that blocks the UI thread. The screensaver's
// limit; raise both once bigger photos are timed on the Sunton.
constexpr uint32_t kMaxSourcePixels = 2048U * 2048U;
constexpr uint8_t kDefaultTileOpacity = 60;
constexpr uint8_t kDefaultDim = 25;
constexpr uint8_t kMaxDim = 60;
constexpr uint8_t kStep = 5;

enum class Reason : uint8_t { Usable, Progressive, TooBig, Unreadable, BadName, TooLarge };
enum class Status : uint8_t { None, Loading, Shown, NoCard, NotFound, Unusable, NoMemory };

inline char lower_ascii(char c) {
  return c >= 'A' && c <= 'Z' ? static_cast<char>(c - 'A' + 'a') : c;
}

inline bool ends_with_ascii_ci(const char* text, size_t len, const char* suffix) {
  const size_t n = strlen(suffix);
  if (len < n) return false;
  for (size_t i = 0; i < n; ++i) {
    if (lower_ascii(text[len - n + i]) != suffix[i]) return false;
  }
  return true;
}

inline bool has_jpeg_extension(const char* name, size_t len) {
  return ends_with_ascii_ci(name, len, ".jpg") || ends_with_ascii_ci(name, len, ".jpeg");
}

// Files shown in the photo list. Names starting with "." are hidden, which also
// skips the "._name.jpg" files macOS writes onto cards.
inline bool is_listed_name(const char* name) {
  return name && name[0] && name[0] != '.' && has_jpeg_extension(name, strlen(name));
}

// The screensaver's is_wallpaper_file() rules (image_screensaver.cpp) plus a
// length that fits DeviceConfig::background_photo.
inline bool is_safe_name(const char* name) {
  if (!name || !name[0]) return false;
  const size_t len = strlen(name);
  if (len >= kMaxPhotoName) return false;
  if (strchr(name, '/') || strchr(name, '\\') || strstr(name, "..")) return false;
  return has_jpeg_extension(name, len);
}

inline Reason reason_for(const char* name, uint32_t size, jpeg_probe::Kind kind) {
  if (!is_safe_name(name)) return Reason::BadName;
  if (size > kMaxFileBytes) return Reason::TooBig;
  if (kind == jpeg_probe::Kind::Progressive) return Reason::Progressive;
  if (kind == jpeg_probe::Kind::Unsupported) return Reason::Unreadable;
  return Reason::Usable;
}

// The same, with the probed size.
inline Reason reason_for(const char* name, uint32_t size, const jpeg_probe::Info& info) {
  const Reason reason = reason_for(name, size, info.kind);
  if (reason != Reason::Usable) return reason;
  return static_cast<uint32_t>(info.width) * info.height > kMaxSourcePixels ? Reason::TooLarge
                                                                             : Reason::Usable;
}

// Status of a chosen photo before it is decoded; Loading means "decode it".
inline Status status_before_decode(bool has_photo, bool sd_ready, bool exists,
                                   Reason reason) {
  if (!has_photo) return Status::None;
  if (!sd_ready) return Status::NoCard;
  if (!exists) return Status::NotFound;
  if (reason != Reason::Usable) return Status::Unusable;
  return Status::Loading;
}

// ASCII case-insensitive order; ties broken by byte order so sorting is stable
// across directory orders.
inline int compare_names(const char* a, const char* b) {
  for (size_t i = 0;; ++i) {
    const unsigned char ca = static_cast<unsigned char>(lower_ascii(a[i]));
    const unsigned char cb = static_cast<unsigned char>(lower_ascii(b[i]));
    if (ca != cb) return ca < cb ? -1 : 1;
    if (!ca) break;
  }
  const int raw = strcmp(a, b);
  return raw < 0 ? -1 : raw > 0 ? 1 : 0;
}

inline uint8_t round_to_step(int value) {
  return static_cast<uint8_t>((value + kStep / 2) / kStep * kStep);
}

inline uint8_t clamp_opacity(int value, uint8_t floor) {
  if (value < 0) value = 0;
  if (value > 100) value = 100;
  const uint8_t rounded = round_to_step(value);
  return rounded < floor ? floor : rounded;
}

inline uint8_t clamp_dim(int value) {
  if (value < 0) value = 0;
  if (value > kMaxDim) value = kMaxDim;
  return round_to_step(value);
}

// Stored settings as load and save() keep them: the name ends inside its field,
// an unsafe name means no photo, the sliders are clamped.
inline void normalize(char (&photo)[kMaxPhotoName], uint8_t& tile_opacity, uint8_t& dim) {
  photo[kMaxPhotoName - 1] = '\0';
  if (!is_safe_name(photo)) photo[0] = '\0';
  tile_opacity = clamp_opacity(tile_opacity, 0);
  dim = clamp_dim(dim);
}

// Card background opacity over the photo, from the renderer's own value.
inline uint8_t card_opa(uint8_t rendered, uint8_t pct) {
  return static_cast<uint8_t>((static_cast<uint32_t>(rendered) * pct + 50) / 100);
}

// A pressed card moves halfway back to the renderer's opacity, so a press is
// visible even at 0 %.
inline uint8_t card_pressed_opa(uint8_t rendered, uint8_t pct) {
  const uint8_t a = card_opa(rendered, pct);
  return static_cast<uint8_t>(a + (rendered - a) / 2);
}

// Optional byte swap to native RGB565, then the dim, once per decoded photo.
inline void finish_pixels(uint16_t* px, size_t n, uint8_t dim_pct, bool swap_bytes) {
  const uint32_t keep = 100U - (dim_pct > 100 ? 100 : dim_pct);
  for (size_t i = 0; i < n; ++i) {
    uint16_t c = px[i];
    if (swap_bytes) c = static_cast<uint16_t>((c >> 8) | (c << 8));
    if (keep != 100) {
      const uint32_t r = ((c >> 11) * keep + 50) / 100;
      const uint32_t g = (((c >> 5) & 0x3F) * keep + 50) / 100;
      const uint32_t b = ((c & 0x1F) * keep + 50) / 100;
      c = static_cast<uint16_t>((r << 11) | (g << 5) | b);
    }
    px[i] = c;
  }
}

// Turns a w x h image upright for EXIF orientation 1-8 (any other value acts as
// 1). dst is w x h for 1-4 and h x w for 5-8; it must not alias src.
inline void orient(const uint16_t* src, uint16_t w, uint16_t h, uint8_t orientation,
                   uint16_t* dst) {
  const int32_t W = w;
  const int32_t H = h;
  // Source index = origin + x * dx + y * dy for output pixel (x, y).
  int32_t origin = 0;
  int32_t dx = 1;
  int32_t dy = W;
  int32_t out_w = W;
  int32_t out_h = H;
  switch (orientation) {
    case 2: origin = W - 1; dx = -1; dy = W; break;
    case 3: origin = (H - 1) * W + W - 1; dx = -1; dy = -W; break;
    case 4: origin = (H - 1) * W; dx = 1; dy = -W; break;
    case 5: origin = 0; dx = W; dy = 1; out_w = H; out_h = W; break;
    case 6: origin = (H - 1) * W; dx = -W; dy = 1; out_w = H; out_h = W; break;
    case 7: origin = (H - 1) * W + W - 1; dx = -W; dy = -1; out_w = H; out_h = W; break;
    case 8: origin = W - 1; dx = W; dy = -1; out_w = H; out_h = W; break;
    default: break;
  }
  for (int32_t y = 0; y < out_h; ++y) {
    int32_t s = origin + y * dy;
    uint16_t* row = dst + static_cast<size_t>(y) * static_cast<size_t>(out_w);
    for (int32_t x = 0; x < out_w; ++x, s += dx) row[x] = src[s];
  }
}

}  // namespace background_rules
