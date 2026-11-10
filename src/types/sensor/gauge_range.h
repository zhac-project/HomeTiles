#pragma once

#include <math.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

// A Sensor gauge's minimum and maximum may carry decimals (issue #83: a LiPo
// gauge from 3.7 to 4.2 V became 4 to 4). The stored tile keeps them as whole
// numbers (PackedTileV7 unchanged), both scaled by 10^decimals with one count
// for the pair (0-3, scene_alias[11] beside the other gauge options); a tile
// stored before has 0 decimals and means what it meant.
namespace sensor_gauge {

constexpr uint8_t kMaxDecimals = 3;

inline int32_t scale_of(uint8_t decimals) {
  static const int32_t kScales[] = {1, 10, 100, 1000};
  return kScales[decimals > kMaxDecimals ? kMaxDecimals : decimals];
}

// A bound as typed or imported ("3.7", "3,70", "-12", "100"): its value and
// the decimals it needs (trailing zeros dropped, at most kMaxDecimals). False
// for an empty text or no number.
inline bool parse(const char* text, double& value, uint8_t& decimals) {
  if (!text) return false;
  char buffer[32];
  size_t length = 0;
  for (const char* p = text; *p && length + 1 < sizeof(buffer); ++p) {
    if (*p == ' ' || *p == '\t') continue;
    buffer[length++] = *p == ',' ? '.' : *p;
  }
  buffer[length] = '\0';
  if (!length) return false;
  char* end = nullptr;
  value = strtod(buffer, &end);
  if (end == buffer || *end != '\0' || !isfinite(value)) return false;
  decimals = 0;
  const char* dot = nullptr;
  for (const char* p = buffer; *p; ++p) {
    if (*p == '.') dot = p;
  }
  if (dot) {
    size_t digits = 0;
    for (const char* p = dot + 1; *p >= '0' && *p <= '9'; ++p) digits = static_cast<size_t>(p - dot);
    while (digits > 0 && dot[digits] == '0') --digits;
    decimals = static_cast<uint8_t>(digits > kMaxDecimals ? kMaxDecimals : digits);
  }
  return true;
}

// Both bounds with one shared count of decimals, rounded to it; fewer
// decimals when a scaled bound would leave the stored int32.
inline void store(double min, double max, uint8_t decimals, int32_t& out_min, int32_t& out_max,
                  uint8_t& out_decimals) {
  if (decimals > kMaxDecimals) decimals = kMaxDecimals;
  for (;;) {
    const double scale = scale_of(decimals);
    const double low = round(min * scale), high = round(max * scale);
    if ((fabs(low) <= 2147483647.0 && fabs(high) <= 2147483647.0) || decimals == 0) {
      out_min = static_cast<int32_t>(fmax(-2147483647.0, fmin(2147483647.0, low)));
      out_max = static_cast<int32_t>(fmax(-2147483647.0, fmin(2147483647.0, high)));
      out_decimals = decimals;
      return;
    }
    --decimals;
  }
}

inline float value(int32_t stored, uint8_t decimals) {
  return static_cast<float>(static_cast<double>(stored) / scale_of(decimals));
}

// A stored bound as the Web Admin shows it ("3.7", "4", "-0.25").
inline void format(int32_t stored, uint8_t decimals, char* out, size_t size) {
  if (!out || !size) return;
  if (decimals > kMaxDecimals) decimals = kMaxDecimals;
  const int32_t scale = scale_of(decimals);
  const int64_t whole = static_cast<int64_t>(stored);
  const int64_t magnitude = whole < 0 ? -whole : whole;
  int64_t fraction = magnitude % scale;
  uint8_t digits = decimals;
  while (digits > 0 && fraction % 10 == 0) {
    fraction /= 10;
    --digits;
  }
  if (!digits) {
    snprintf(out, size, "%s%lld", whole < 0 ? "-" : "", static_cast<long long>(magnitude / scale));
  } else {
    snprintf(out, size, "%s%lld.%0*lld", whole < 0 ? "-" : "", static_cast<long long>(magnitude / scale),
             static_cast<int>(digits), static_cast<long long>(fraction));
  }
}

}  // namespace sensor_gauge
