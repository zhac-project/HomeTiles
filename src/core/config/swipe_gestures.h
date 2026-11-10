#pragma once

#include <stdint.h>

// The edge swipes of the panel (user 2026-10-11: one gesture menu): each of
// the four edges opens at most one action, each action has at most one
// edge. Settings keeps its edge in the Settings access record
// (settings_swipe_enabled, settings_reveal_edge) because the hidden Settings
// tile needs it as its way back; Home, Back and the screensaver keep theirs
// in the config (home/back/screensaver_swipe_edge). Edges follow
// SettingsRevealEdge: 0 left, 1 right, 2 top, 3 bottom.
namespace swipe_gestures {

enum Action : uint8_t { kOff = 0, kSettings = 1, kHome = 2, kBack = 3, kScreensaver = 4 };
inline constexpr uint8_t kActionCount = 5;
inline constexpr uint8_t kEdgeCount = 4;
// The edge of an action that has none.
inline constexpr uint8_t kEdgeOff = 4;
// New panels (user 2026-10-11): Settings from the top, Home from the bottom,
// Back and the screensaver off.
inline constexpr uint8_t kDefaultSettingsEdge = 2;
inline constexpr uint8_t kDefaultHomeEdge = 3;

inline uint8_t valid_edge(uint8_t edge) { return edge < kEdgeCount ? edge : kEdgeOff; }

// One action per edge for a config (DeviceConfig or a test stand-in): Settings
// first, then Home, Back and the screensaver.
template <typename Config>
inline void actions(const Config& cfg, uint8_t out[kEdgeCount]) {
  for (uint8_t edge = 0; edge < kEdgeCount; ++edge) out[edge] = kOff;
  if (cfg.settings_swipe_enabled && cfg.settings_reveal_edge < kEdgeCount) out[cfg.settings_reveal_edge] = kSettings;
  const uint8_t edges[] = {cfg.home_swipe_edge, cfg.back_swipe_edge, cfg.screensaver_swipe_edge};
  const uint8_t kinds[] = {kHome, kBack, kScreensaver};
  for (uint8_t i = 0; i < 3; ++i) {
    const uint8_t edge = valid_edge(edges[i]);
    if (edge != kEdgeOff && out[edge] == kOff) out[edge] = kinds[i];
  }
}

// Every action on at most one edge, every edge with at most one action
// (Settings keeps its edge, then Home, Back, the screensaver); a hidden
// Settings tile keeps the swipe as its way back.
template <typename Config>
inline void normalize(Config& cfg) {
  if (cfg.settings_reveal_edge >= kEdgeCount) cfg.settings_reveal_edge = kDefaultSettingsEdge;
  if (cfg.settings_tile_hidden) cfg.settings_swipe_enabled = true;
  uint8_t out[kEdgeCount];
  actions(cfg, out);
  uint8_t home = kEdgeOff, back = kEdgeOff, saver = kEdgeOff;
  for (uint8_t edge = 0; edge < kEdgeCount; ++edge) {
    if (out[edge] == kHome) home = edge;
    if (out[edge] == kBack) back = edge;
    if (out[edge] == kScreensaver) saver = edge;
  }
  cfg.home_swipe_edge = home;
  cfg.back_swipe_edge = back;
  cfg.screensaver_swipe_edge = saver;
}

// Applies the gesture menu: `wanted` holds one action per edge. An action
// chosen twice keeps its first edge. Without Settings on any edge its swipe
// turns off, unless the Settings tile is hidden: then Settings stays on its
// edge and that edge's other action turns off.
template <typename Config>
inline void apply(Config& cfg, const uint8_t wanted_in[kEdgeCount]) {
  uint8_t wanted[kEdgeCount];
  bool used[kActionCount] = {};
  for (uint8_t edge = 0; edge < kEdgeCount; ++edge) {
    const uint8_t action = wanted_in[edge] < kActionCount ? wanted_in[edge] : kOff;
    wanted[edge] = action != kOff && used[action] ? kOff : action;
    used[wanted[edge]] = true;
  }
  uint8_t settings = kEdgeOff;
  for (uint8_t edge = 0; edge < kEdgeCount; ++edge) {
    if (wanted[edge] == kSettings) settings = edge;
  }
  if (settings == kEdgeOff && cfg.settings_tile_hidden) {
    settings = cfg.settings_reveal_edge < kEdgeCount ? cfg.settings_reveal_edge : kDefaultSettingsEdge;
    wanted[settings] = kSettings;
  }
  cfg.settings_swipe_enabled = settings != kEdgeOff;
  if (settings != kEdgeOff) cfg.settings_reveal_edge = settings;
  cfg.home_swipe_edge = kEdgeOff;
  cfg.back_swipe_edge = kEdgeOff;
  cfg.screensaver_swipe_edge = kEdgeOff;
  for (uint8_t edge = 0; edge < kEdgeCount; ++edge) {
    if (wanted[edge] == kHome) cfg.home_swipe_edge = edge;
    if (wanted[edge] == kBack) cfg.back_swipe_edge = edge;
    if (wanted[edge] == kScreensaver) cfg.screensaver_swipe_edge = edge;
  }
}

}  // namespace swipe_gestures
