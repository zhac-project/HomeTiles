#include "src/core/diagnostics/frame_bench.h"

#if defined(HOMETILES_BENCH_FRAMES)
#include <Arduino.h>
#include <lvgl.h>

#include "src/ui/tabs/tiles/tab_tiles_unified.h"

// A frame is a refresh pass that rendered; empty timer passes are skipped, as
// in popup_timing. One set of sums per window, no history. Everything runs in
// the LVGL thread: display events, LVGL timers and the folder tap.
namespace frame_bench {
namespace {

constexpr uint32_t kWindowMs = 5000;
constexpr uint32_t kBurstEveryMs = 30000;
constexpr uint32_t kBurstStepMs = 100;
constexpr uint8_t kBurstCards = 20;

struct Stats {
  uint32_t frames = 0;
  uint64_t total_us = 0;
  uint32_t max_us = 0;

  void add(uint32_t us) {
    ++frames;
    total_us += us;
    if (us > max_us) max_us = us;
  }

  void log(const char* name) {
    Serial.printf("[BENCH] %s frames=%u avg_us=%lu max_us=%lu\n", name, static_cast<unsigned>(frames),
                  static_cast<unsigned long>(frames ? total_us / frames : 0),
                  static_cast<unsigned long>(max_us));
    *this = {};
  }
};

Stats g_window;
Stats g_burst;
uint32_t g_frame_start_us = 0;
bool g_rendered = false;
bool g_folder_armed = false;
uint32_t g_folder_request_ms = 0;
lv_timer_t* g_burst_step = nullptr;
uint8_t g_burst_cards = 0;
bool g_burst_active = false;
uint32_t g_next_card = 0;

void display_event(lv_event_t* event) {
  const uint32_t now = micros();
  const lv_event_code_t code = lv_event_get_code(event);
  if (code == LV_EVENT_REFR_START) {
    g_frame_start_us = now;
    g_rendered = false;
    return;
  }
  if (code == LV_EVENT_RENDER_START) {
    g_rendered = true;
    return;
  }
  if (!g_rendered) return;
  g_rendered = false;
  const uint32_t us = now - g_frame_start_us;
  g_window.add(us);
  if (g_burst_active) g_burst.add(us);
  // The switch runs in the loop after the tap; frames before it (the pressed
  // tile) do not show the folder.
  if (g_folder_armed && !tiles_folder_switch_pending()) {
    g_folder_armed = false;
    Serial.printf("[BENCH] folder_open_ms=%lu\n", static_cast<unsigned long>(millis() - g_folder_request_ms));
  }
}

void on_window(lv_timer_t*) {
  if (g_window.frames) g_window.log("win");
}

void invalidate_next_card() {
  lv_obj_t* grid = tiles_active_grid();
  const uint32_t count = grid ? lv_obj_get_child_count(grid) : 0;
  if (count) lv_obj_invalidate(lv_obj_get_child(grid, static_cast<int32_t>(g_next_card++ % count)));
}

void on_burst_step(lv_timer_t* timer) {
  if (g_burst_cards < kBurstCards) {
    invalidate_next_card();
    ++g_burst_cards;
    return;
  }
  // The last card had a full step to render.
  lv_timer_pause(timer);
  g_burst_active = false;
  g_burst.log("burst");
}

void on_burst_start(lv_timer_t*) {
  g_burst = {};
  g_burst_cards = 0;
  g_burst_active = true;
  on_burst_step(g_burst_step);
  lv_timer_reset(g_burst_step);
  lv_timer_resume(g_burst_step);
}

}  // namespace

void begin() {
  lv_display_t* display = lv_display_get_default();
  if (!display) return;
  lv_display_add_event_cb(display, display_event, LV_EVENT_REFR_START, nullptr);
  lv_display_add_event_cb(display, display_event, LV_EVENT_RENDER_START, nullptr);
  lv_display_add_event_cb(display, display_event, LV_EVENT_REFR_READY, nullptr);
  lv_timer_create(on_window, kWindowMs, nullptr);
  lv_timer_create(on_burst_start, kBurstEveryMs, nullptr);
  g_burst_step = lv_timer_create(on_burst_step, kBurstStepMs, nullptr);
  lv_timer_pause(g_burst_step);
  Serial.printf("[BENCH] frame bench on\n");
}

void folder_open_requested() {
  g_folder_armed = true;
  g_folder_request_ms = millis();
}

}  // namespace frame_bench
#endif
