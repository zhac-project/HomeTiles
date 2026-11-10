#pragma once

// Header-only JPEG header probe for the background photo list. It walks the
// marker segments up to the frame header (SOF) without decoding, so a card
// with many photos can be listed with a few small reads per file. Pure C++ so
// tools/tests/ui/test-jpeg-probe.mjs compiles it on the host.

#include <stddef.h>
#include <stdint.h>
#include <string.h>

namespace jpeg_probe {

enum class Kind : uint8_t { Baseline, Progressive, Unsupported };

struct Info {
  Kind kind = Kind::Unsupported;
  uint16_t width = 0;
  uint16_t height = 0;
  uint8_t orientation = 1;  // EXIF orientation 1-8; 1 when absent
};

// Damaged files must not turn the walk into an endless chain of reads.
constexpr uint8_t kMaxSegments = 64;
constexpr uint8_t kMaxFillBytes = 8;
// Only the start of an APP1 is read; IFD0 sits right after the TIFF header.
constexpr uint32_t kMaxExifBytes = 4096;

namespace detail {

template <typename ReadAt>
bool read_exact(ReadAt& read_at, uint32_t file_size, uint32_t offset,
                uint8_t* dst, size_t len) {
  if (offset > file_size || len > file_size - offset) return false;
  return read_at(offset, dst, len) == len;
}

inline uint16_t be16(const uint8_t* p) {
  return static_cast<uint16_t>((p[0] << 8) | p[1]);
}

inline uint16_t tiff16(const uint8_t* p, bool le) {
  return le ? static_cast<uint16_t>(p[0] | (p[1] << 8)) : be16(p);
}

inline uint32_t tiff32(const uint8_t* p, bool le) {
  return le ? (static_cast<uint32_t>(tiff16(p + 2, true)) << 16) | tiff16(p, true)
            : (static_cast<uint32_t>(be16(p)) << 16) | be16(p + 2);
}

inline bool is_sof(uint8_t m) {
  return m >= 0xC0 && m <= 0xCF && m != 0xC4 && m != 0xC8 && m != 0xCC;
}

// IFD0 tag 0x0112 (SHORT, count 1, value 1-8) of an APP1 payload starting at
// `start` with `len` bytes; 1 for anything else.
template <typename ReadAt>
uint8_t exif_orientation(ReadAt& read_at, uint32_t file_size, uint32_t start,
                         uint32_t len) {
  if (len > kMaxExifBytes) len = kMaxExifBytes;
  uint8_t head[14];  // "Exif\0\0" + TIFF header
  if (len < sizeof(head) ||
      !read_exact(read_at, file_size, start, head, sizeof(head))) {
    return 1;
  }
  if (memcmp(head, "Exif\0\0", 6) != 0) return 1;
  const uint8_t* tiff = head + 6;
  bool le;
  if (tiff[0] == 'I' && tiff[1] == 'I' && tiff[2] == 0x2A && tiff[3] == 0) {
    le = true;
  } else if (tiff[0] == 'M' && tiff[1] == 'M' && tiff[2] == 0 && tiff[3] == 0x2A) {
    le = false;
  } else {
    return 1;
  }

  const uint32_t tiff_start = start + 6;
  const uint32_t tiff_len = len - 6;
  const uint32_t ifd = tiff32(tiff + 4, le);
  if (ifd > tiff_len || tiff_len - ifd < 2) return 1;
  uint8_t count_bytes[2];
  if (!read_exact(read_at, file_size, tiff_start + ifd, count_bytes, 2)) return 1;
  const uint16_t count = tiff16(count_bytes, le);
  for (uint16_t i = 0; i < count; ++i) {
    const uint32_t entry = ifd + 2 + static_cast<uint32_t>(i) * 12;
    if (entry > tiff_len || tiff_len - entry < 12) return 1;
    uint8_t e[12];
    if (!read_exact(read_at, file_size, tiff_start + entry, e, sizeof(e))) return 1;
    if (tiff16(e, le) != 0x0112) continue;
    if (tiff16(e + 2, le) != 3 || tiff32(e + 4, le) != 1) return 1;
    const uint16_t value = tiff16(e + 8, le);
    return value >= 1 && value <= 8 ? static_cast<uint8_t>(value) : 1;
  }
  return 1;
}

}  // namespace detail

// read_at(uint32_t offset, uint8_t* dst, size_t len) returns the bytes it read.
// Never asks for bytes past file_size.
template <typename ReadAt>
Info probe(ReadAt&& read_at, uint32_t file_size, bool want_orientation) {
  Info info;
  uint8_t b[5];
  if (!detail::read_exact(read_at, file_size, 0, b, 2) || b[0] != 0xFF ||
      b[1] != 0xD8) {
    return info;
  }

  uint32_t pos = 2;
  uint8_t orientation = 1;
  uint8_t segments = 0;
  for (;;) {
    // Marker, then the length of a segment that carries one.
    if (!detail::read_exact(read_at, file_size, pos, b, 4) || b[0] != 0xFF) {
      return info;
    }
    uint8_t fills = 0;
    while (b[1] == 0xFF) {
      if (++fills > kMaxFillBytes) return info;
      ++pos;
      if (!detail::read_exact(read_at, file_size, pos, b, 4)) return info;
    }
    const uint8_t marker = b[1];
    if (++segments > kMaxSegments) return info;
    if (marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
      pos += 2;  // standalone marker, no length
      continue;
    }
    // A second SOI, scan data or EOI before any frame header: not a usable file.
    if (marker == 0x00 || marker == 0xD8 || marker == 0xD9 || marker == 0xDA) {
      return info;
    }
    const uint16_t len = detail::be16(b + 2);
    if (len < 2 || len - 2u > file_size - (pos + 4)) return info;

    if (detail::is_sof(marker)) {
      if (len < 2 + 5 ||
          !detail::read_exact(read_at, file_size, pos + 4, b, 5)) {
        return info;
      }
      const uint16_t height = detail::be16(b + 1);
      const uint16_t width = detail::be16(b + 3);
      if (width == 0 || height == 0) return info;
      info.width = width;
      info.height = height;
      info.orientation = orientation;
      if (marker == 0xC0) {
        info.kind = Kind::Baseline;
      } else if (marker == 0xC2 || marker == 0xC6 || marker == 0xCA ||
                 marker == 0xCE) {
        info.kind = Kind::Progressive;
      }
      return info;
    }
    if (marker == 0xE1 && want_orientation && orientation == 1) {
      orientation =
          detail::exif_orientation(read_at, file_size, pos + 4, len - 2u);
    }
    pos += 2u + len;
  }
}

}  // namespace jpeg_probe
