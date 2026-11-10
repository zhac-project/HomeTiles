#pragma once

#include <string.h>

// Temperature units as Home Assistant writes them ("°C", "°F", "K", also "℃"
// and "℉" or a bare "C"/"F") and the conversion between them. A Weather
// tile's chosen temperature sensor shows in the weather entity's unit, so the
// current temperature and the forecast always agree (user 2026-10-12: a °F
// sensor beside a °C weather entity showed its °F number with "°C"). The Web
// Admin preview mirrors this in types/weather/admin.js.
namespace temperature_units {

// 'C', 'F', 'K', or 0 for an empty or unknown unit.
inline char of(const char* text) {
  if (!text) return 0;
  while (*text == ' ') ++text;
  if (!strncmp(text, "\xE2\x84\x83", 3)) return 'C';  // ℃
  if (!strncmp(text, "\xE2\x84\x89", 3)) return 'F';  // ℉
  if (!strncmp(text, "\xC2\xB0", 2)) text += 2;       // °
  const char unit = *text;
  if (!unit) return 0;
  ++text;
  while (*text == ' ') ++text;
  if (*text) return 0;
  if (unit == 'C' || unit == 'c') return 'C';
  if (unit == 'F' || unit == 'f') return 'F';
  if (unit == 'K') return 'K';
  return 0;
}

// `value` from one unit in another; unchanged when either is unknown.
inline float convert(float value, char from, char to) {
  if (!from || !to || from == to) return value;
  const float celsius = from == 'F' ? (value - 32.0f) * 5.0f / 9.0f : from == 'K' ? value - 273.15f : value;
  return to == 'F' ? celsius * 9.0f / 5.0f + 32.0f : to == 'K' ? celsius + 273.15f : celsius;
}

}  // namespace temperature_units
