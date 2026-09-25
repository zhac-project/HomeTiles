#include "src/devices/sunton_esp32_8048s070c/device_sunton_esp32_8048s070c.h"
#include "src/devices/device_select.h"
#include "src/devices/guition_esp32_4848s040/s3_diagnostics.h"

#if defined(DEVICE_SUNTON_ESP32_8048S070C)

#include <Arduino.h>
#include <Arduino_GFX_Library.h>

#include <LittleFS.h>
#include <WiFi.h>
#include <Wire.h>
#include <esp_err.h>
#include <esp_heap_caps.h>
#include <esp_lcd_panel_ops.h>
#include <esp_lcd_panel_rgb.h>
#include <esp_phy_init.h>
#include <esp_private/periph_ctrl.h>
#include <hal/lcd_ll.h>

#include <algorithm>
#include <cstring>
#include <iterator>

namespace {

// Pin map and panel timing: openHASP's `sunton-8048s070c_16MB` environment
// (user_setups/esp32s3/sunton-esp32-s3-tft.ini), which runs on this exact
// board. The panel is RGB-only: there is no command bus and no init table.
constexpr int8_t kPanelDe = 41;
constexpr int8_t kPanelVsync = 40;
constexpr int8_t kPanelHsync = 39;
constexpr int8_t kPanelPclk = 42;
constexpr int8_t kPanelR0 = 14;
constexpr int8_t kPanelR1 = 21;
constexpr int8_t kPanelR2 = 47;
constexpr int8_t kPanelR3 = 48;
constexpr int8_t kPanelR4 = 45;
constexpr int8_t kPanelG0 = 9;
constexpr int8_t kPanelG1 = 46;
constexpr int8_t kPanelG2 = 3;
constexpr int8_t kPanelG3 = 8;
constexpr int8_t kPanelG4 = 16;
constexpr int8_t kPanelG5 = 1;
constexpr int8_t kPanelB0 = 15;
constexpr int8_t kPanelB1 = 7;
constexpr int8_t kPanelB2 = 6;
constexpr int8_t kPanelB3 = 5;
constexpr int8_t kPanelB4 = 4;

constexpr int16_t kPanelWidth = 800;
constexpr int16_t kPanelHeight = 480;

constexpr int8_t kBacklightPin = 2;
// 1 kHz keeps the backlight PWM well clear of visible flicker (openHASP uses
// the same GPIO 2); 10-bit resolution as on the Guition S3 profile.
constexpr uint32_t kBacklightFrequency = 1000;
constexpr uint8_t kBacklightResolution = 10;
constexpr uint16_t kBacklightMaxDuty = (1u << kBacklightResolution) - 1u;

constexpr int8_t kTouchSda = 19;
constexpr int8_t kTouchScl = 20;
// GT911 reset; its INT line is not wired, so the address after reset may be
// either 0x5D or 0x14 (both are probed).
constexpr int8_t kTouchRst = 38;
constexpr uint32_t kTouchFrequency = 400000;
constexpr uint8_t kTouchAddressPrimary = 0x5D;
constexpr uint8_t kTouchAddressAlternate = 0x14;
constexpr uint16_t kTouchProductIdRegister = 0x8140;
constexpr uint16_t kTouchStatusRegister = 0x814E;
constexpr uint16_t kTouchPointRegister = 0x814F;
// Keep a held point across normal GT911 "no new frame" polls, but do not let
// a broken I2C/data path leave LVGL pressed forever. At the 8 ms input period,
// 16 consecutive real errors give the bus roughly 128 ms to recover.
constexpr uint8_t kTouchErrorReleaseThreshold = 16;

#if (defined(CONFIG_SPIRAM_XIP_FROM_PSRAM) && CONFIG_SPIRAM_XIP_FROM_PSRAM) || \
    ((defined(CONFIG_SPIRAM_FETCH_INSTRUCTIONS) && CONFIG_SPIRAM_FETCH_INSTRUCTIONS) && \
     (defined(CONFIG_SPIRAM_RODATA) && CONFIG_SPIRAM_RODATA))
#define HOMETILES_GUITION_S3_HAS_PSRAM_XIP 1
#else
#define HOMETILES_GUITION_S3_HAS_PSRAM_XIP 0
#endif

#if defined(CONFIG_ESP32S3_DATA_CACHE_LINE_64B) && \
    CONFIG_ESP32S3_DATA_CACHE_LINE_64B
#define HOMETILES_GUITION_S3_HAS_CACHE_LINE_64B 1
#else
#define HOMETILES_GUITION_S3_HAS_CACHE_LINE_64B 0
#endif

#ifndef HOMETILES_GUITION_S3_RGB_TEST_VARIANT
#define HOMETILES_GUITION_S3_RGB_TEST_VARIANT 0
#endif

#if HOMETILES_GUITION_S3_RGB_TEST_VARIANT == 1
#define HOMETILES_GUITION_S3_RGB_TEST_LABEL "A-driver-fix-bounce10"
#define HOMETILES_GUITION_S3_RGB_BOUNCE_ROWS 10
#elif HOMETILES_GUITION_S3_RGB_TEST_VARIANT == 2
#define HOMETILES_GUITION_S3_RGB_TEST_LABEL "B-driver-fix-bounce20"
#define HOMETILES_GUITION_S3_RGB_BOUNCE_ROWS 20
#elif HOMETILES_GUITION_S3_RGB_TEST_VARIANT == 0
#if HOMETILES_GUITION_S3_HAS_PSRAM_XIP && \
    HOMETILES_GUITION_S3_HAS_CACHE_LINE_64B
#define HOMETILES_GUITION_S3_RGB_TEST_LABEL "release-xip-bounce10"
#define HOMETILES_GUITION_S3_RGB_BOUNCE_ROWS 10
#else
// Direct PSRAM framebuffer without the cache-fed RGB bounce path, as on the
// Guition S3 profile: on the stock Arduino SDK the external-memory cache is
// disabled during main-flash writes, so a bounce ISR cannot refill its
// internal line buffers reliably.
#define HOMETILES_GUITION_S3_RGB_TEST_LABEL "release-direct-flash-guard"
#define HOMETILES_GUITION_S3_RGB_BOUNCE_ROWS 0
#endif
#else
#error "Unknown Guition S3 RGB test variant"
#endif

// openHASP runs this board at 13.9 MHz and notes 12 MHz as good. The lower
// value leaves more PSRAM bandwidth for WiFi/TLS next to continuous RGB
// scanout (Espressif's advice for direct PSRAM framebuffers); 800x480 at
// 12 MHz refreshes at about 27 Hz.
constexpr uint32_t kRgbPclkHz = 12000000;
// Reduced for the synchronous HTTPS version check, as on the Guition S3.
constexpr uint32_t kUpdateCheckRgbPclkHz = 7000000;
constexpr uint16_t kHsyncFrontPorch = 8;
constexpr uint16_t kHsyncPulseWidth = 10;
constexpr uint16_t kHsyncBackPorch = 43;
constexpr uint16_t kVsyncFrontPorch = 8;
constexpr uint16_t kVsyncPulseWidth = 8;
constexpr uint16_t kVsyncBackPorch = 12;
constexpr size_t kRgbBounceBufferPixels =
    kPanelWidth * HOMETILES_GUITION_S3_RGB_BOUNCE_ROWS;
constexpr uint32_t kRgbHorizontalTotal =
    kPanelWidth + kHsyncFrontPorch + kHsyncPulseWidth + kHsyncBackPorch;
constexpr uint32_t kRgbVerticalTotal =
    kPanelHeight + kVsyncFrontPorch + kVsyncPulseWidth + kVsyncBackPorch;
constexpr uint32_t kRgbFramePeriodMs =
    ((kRgbHorizontalTotal * kRgbVerticalTotal * 1000U) + kRgbPclkHz - 1U) /
    kRgbPclkHz;
constexpr bool kHasPsramXip = HOMETILES_GUITION_S3_HAS_PSRAM_XIP != 0;
constexpr bool kHasCacheLine64 =
    HOMETILES_GUITION_S3_HAS_CACHE_LINE_64B != 0;

#if defined(CONFIG_COMPILER_OPTIMIZATION_PERF) && \
    CONFIG_COMPILER_OPTIMIZATION_PERF
constexpr const char* kCompilerOptimization = "O2";
#else
constexpr const char* kCompilerOptimization = "size";
#endif
#if defined(CONFIG_LCD_RGB_RESTART_IN_VSYNC) && \
    CONFIG_LCD_RGB_RESTART_IN_VSYNC
constexpr bool kRestartInVsync = true;
#else
constexpr bool kRestartInVsync = false;
#endif

class SuntonAtomicRgbDisplay final : public Arduino_RGB_Display {
 public:
  explicit SuntonAtomicRgbDisplay(uint8_t rotation)
      : Arduino_RGB_Display(kPanelWidth, kPanelHeight, nullptr, rotation, true,
                            nullptr, GFX_NOT_DEFINED, nullptr, 0) {}

  bool begin(int32_t speed = GFX_NOT_DEFINED) override {
    (void)speed;  // RGB-only panel: no command bus to start, no init table.
    esp_lcd_rgb_panel_config_t config{};
    config.clk_src = LCD_CLK_SRC_DEFAULT;
    config.timings.pclk_hz = kRgbPclkHz;
    config.timings.h_res = kPanelWidth;
    config.timings.v_res = kPanelHeight;
    config.timings.hsync_pulse_width = kHsyncPulseWidth;
    config.timings.hsync_back_porch = kHsyncBackPorch;
    config.timings.hsync_front_porch = kHsyncFrontPorch;
    config.timings.vsync_pulse_width = kVsyncPulseWidth;
    config.timings.vsync_back_porch = kVsyncBackPorch;
    config.timings.vsync_front_porch = kVsyncFrontPorch;
    // openHASP: HSYNC/VSYNC polarity 0 (idle low, as Arduino_GFX maps it) and
    // data sampled on the falling PCLK edge.
    config.timings.flags.hsync_idle_low = 1;
    config.timings.flags.vsync_idle_low = 1;
    config.timings.flags.de_idle_high = 0;
    config.timings.flags.pclk_active_neg = 1;
    config.timings.flags.pclk_idle_high = 0;
    config.data_width = 16;
    config.bits_per_pixel = 16;
    config.num_fbs = 2;
    config.bounce_buffer_size_px = kRgbBounceBufferPixels;
    config.sram_trans_align = 8;
    config.psram_trans_align = 64;
    config.hsync_gpio_num = kPanelHsync;
    config.vsync_gpio_num = kPanelVsync;
    config.de_gpio_num = kPanelDe;
    config.pclk_gpio_num = kPanelPclk;
    config.disp_gpio_num = GPIO_NUM_NC;
    const int data_pins[16] = {
        kPanelB0, kPanelB1, kPanelB2, kPanelB3, kPanelB4,
        kPanelG0, kPanelG1, kPanelG2, kPanelG3, kPanelG4, kPanelG5,
        kPanelR0, kPanelR1, kPanelR2, kPanelR3, kPanelR4};
    std::copy(std::begin(data_pins), std::end(data_pins),
              config.data_gpio_nums);
    config.flags.disp_active_low = true;
    config.flags.refresh_on_demand = false;
    config.flags.fb_in_psram = true;
    config.flags.double_fb = true;
    config.flags.no_fb = false;
    config.flags.bb_invalidate_cache = false;

    esp_err_t err = esp_lcd_new_rgb_panel(&config, &panel_handle_);
    if (err == ESP_OK) {
      esp_lcd_rgb_panel_event_callbacks_t callbacks{};
      callbacks.on_vsync = onVsync;
      callbacks.on_frame_buf_complete = onFrameComplete;
      err = esp_lcd_rgb_panel_register_event_callbacks(
          panel_handle_, &callbacks, this);
    }
    if (err == ESP_OK) err = esp_lcd_panel_reset(panel_handle_);
    if (err == ESP_OK) err = esp_lcd_panel_init(panel_handle_);
    if (err == ESP_OK) {
      // panel_init() starts the stream and enables VSYNC. Mask immediately,
      // before any further setup work can let Arduino-ESP32's automatic
      // CONFIG_LCD_RGB_RESTART_IN_VSYNC path fire once at a random phase.
      maskVsyncInterrupt();
    }
    if (err == ESP_OK) {
      err = esp_lcd_rgb_panel_get_frame_buffer(
          panel_handle_, 2, reinterpret_cast<void**>(&framebuffers_[0]),
          reinterpret_cast<void**>(&framebuffers_[1]));
    }
    if (err != ESP_OK || !framebuffers_[0] || !framebuffers_[1]) {
      Serial.printf(
          "[Display/S3] Double framebuffer init failed: %s (0x%X)\n",
          esp_err_to_name(err), static_cast<unsigned>(err));
      return false;
    }

    active_index_ = 0;
    pending_index_ = 0;
    atomic_pending_ = false;
    canonical_fb0_valid_ = true;
    _framebuffer = framebuffers_[0];

    // Arduino-ESP32 3.3.7 enables CONFIG_LCD_RGB_RESTART_IN_VSYNC. On S3,
    // IDF 5.5.2's restart link is permanently wired to framebuffer 0, so the
    // ISR both defeats double buffering and can itself cause the documented
    // one-frame horizontal shift when it runs late. The hardware's continuous
    // RGB/GDMA stream is independent of this interrupt and remains enabled.
    return true;
  }

  bool beginAtomicFrame(const char* reason) {
    if (!panel_handle_ || !framebuffers_[0] || !framebuffers_[1]) {
      return false;
    }
    if (storage_transition_) return false;
    if (atomic_pending_) return true;

    pending_index_ = active_index_ ^ 1U;
    if (pending_index_ == 0) canonical_fb0_valid_ = false;
    _framebuffer = framebuffers_[pending_index_];
    atomic_pending_ = true;
    atomic_started_ms_ = millis();
    atomic_reason_ = reason ? reason : "unknown";
#if HOMETILES_GUITION_S3_DIAGNOSTICS_ACTIVE
    Serial.printf(
        "[S3Diag/Display] atomic-begin reason=%s front=%u back=%u "
        "copy=0 full_redraw=required\n",
        atomic_reason_, static_cast<unsigned>(active_index_),
        static_cast<unsigned>(pending_index_));
#endif
    return true;
  }

  bool commitAtomicFrame() {
    if (!atomic_pending_ || !panel_handle_) return false;

    flush(true);
    if (pending_index_ == 0) canonical_fb0_valid_ = true;
    const uint32_t started_us = micros();
    const uint32_t eof_start = frame_complete_count_;
    const esp_err_t err = esp_lcd_panel_draw_bitmap(
        panel_handle_, 0, 0, _fb_width, _fb_height,
        framebuffers_[pending_index_]);
    const bool presented =
        err == ESP_OK && waitForFrameCompletions(eof_start, 3,
                                                 kRgbFramePeriodMs * 5U + 20U);
    if (err == ESP_OK) {
      // Three EOFs cover the current frame, the one additional old frame that
      // IDF says DMA prefetch may emit, and the completed new frame.
      active_index_ = pending_index_;
      canonical_fb0_valid_ = active_index_ == 0;
    }
    _framebuffer = framebuffers_[active_index_];
    atomic_pending_ = false;
#if HOMETILES_GUITION_S3_DIAGNOSTICS_ACTIVE
    Serial.printf(
        "[S3Diag/Display] atomic-commit reason=%s submit=%s(0x%X) "
        "presented=%u front=%u eof_delta=%lu total_us=%lu\n",
        atomic_reason_, esp_err_to_name(err), static_cast<unsigned>(err),
        presented ? 1U : 0U, static_cast<unsigned>(active_index_),
        static_cast<unsigned long>(frame_complete_count_ - eof_start),
        static_cast<unsigned long>(micros() - started_us));
#endif
    atomic_reason_ = "none";
    atomic_started_ms_ = 0;
    return err == ESP_OK && presented;
  }

  void service() {
    // A software JPEG decode on this S3 can legitimately take several
    // seconds before LVGL reaches the first full-screen flush. Keep a generous
    // failsafe for truly abandoned transitions without cancelling valid work.
    if (!atomic_pending_ || atomic_started_ms_ == 0 ||
        millis() - atomic_started_ms_ < 15000U) {
      return;
    }
    _framebuffer = framebuffers_[active_index_];
    atomic_pending_ = false;
    atomic_started_ms_ = 0;
    Serial.printf(
        "[Display/S3] Atomic redraw timeout, keeping framebuffer %u\n",
        static_cast<unsigned>(active_index_));
    atomic_reason_ = "none";
  }

  bool canonicalizeForStorage() {
    if (!panel_handle_) return false;
    storage_transition_ = true;
    if (atomic_pending_) {
      commitAtomicFrame();
    }
    if (active_index_ == 0) {
      _framebuffer = framebuffers_[0];
      canonical_fb0_valid_ = true;
      return true;
    }

    const uint32_t started_us = micros();
    memcpy(framebuffers_[0], framebuffers_[active_index_], _framebuffer_size);
    // The CPU copy lands in cached PSRAM. Write the complete canonical frame
    // back before RGB GDMA is allowed to scan framebuffer 0.
    Cache_WriteBack_Addr(
        reinterpret_cast<uint32_t>(framebuffers_[0]), _framebuffer_size);
    canonical_fb0_valid_ = true;
    const uint32_t eof_start = frame_complete_count_;
    const esp_err_t err = esp_lcd_panel_draw_bitmap(
        panel_handle_, 0, 0, _fb_width, _fb_height, framebuffers_[0]);
    const bool switched =
        err == ESP_OK && waitForFrameCompletions(eof_start, 3,
                                                 kRgbFramePeriodMs * 5U + 20U);
    if (err == ESP_OK) {
      active_index_ = 0;
    }
    _framebuffer = framebuffers_[active_index_];
#if HOMETILES_GUITION_S3_DIAGNOSTICS_ACTIVE
    Serial.printf(
        "[S3Diag/Display] storage-canonicalize result=%s(0x%X) "
        "switched=%u eof_delta=%lu total_us=%lu\n",
        esp_err_to_name(err), static_cast<unsigned>(err), switched ? 1U : 0U,
        static_cast<unsigned long>(frame_complete_count_ - eof_start),
        static_cast<unsigned long>(micros() - started_us));
#endif
    // Even if draw_bitmap or the diagnostic EOF wait fails, framebuffer 0 is
    // a complete cache-flushed copy. The storage-end one-shot restart is
    // hardwired by IDF to this canonical buffer and can still recover it.
    return canonical_fb0_valid_;
  }

  esp_err_t restartAfterStorage(uint32_t& wait_ms) {
    wait_ms = 0;
    if (!panel_handle_ || !canonical_fb0_valid_) {
      storage_transition_ = false;
      return ESP_ERR_INVALID_STATE;
    }

    restart_vsync_seen_ = false;
    restart_one_shot_armed_ = true;
    const uint32_t started_ms = millis();
    esp_err_t err = esp_lcd_rgb_panel_restart(panel_handle_);
    if (err == ESP_OK) {
      enableVsyncInterruptOneShot();
      while (!restart_vsync_seen_ &&
             millis() - started_ms < kRgbFramePeriodMs * 3U + 20U) {
        delay(1);
      }
      if (!restart_vsync_seen_) {
        err = ESP_ERR_TIMEOUT;
      } else {
        const uint32_t eof_start = restart_eof_baseline_;
        if (!waitForFrameCompletions(eof_start, 2,
                                     kRgbFramePeriodMs * 4U + 20U)) {
          err = ESP_ERR_TIMEOUT;
        }
      }
    }
    maskVsyncInterrupt();
    restart_one_shot_armed_ = false;
    if (restart_vsync_seen_) {
      // The current VSYNC ISR performs the hardwired S3 restart to fb0 after
      // invoking our callback, even when the subsequent EOF confirmation
      // times out.
      active_index_ = 0;
      _framebuffer = framebuffers_[0];
    }
    wait_ms = millis() - started_ms;
    storage_transition_ = false;
    return err;
  }

  esp_err_t setPixelClockAndResynchronize(uint32_t pclk_hz,
                                          uint32_t& wait_ms) {
    wait_ms = 0;
    if (!canonicalizeForStorage()) {
      storage_transition_ = false;
      return ESP_ERR_INVALID_STATE;
    }

    const esp_err_t pclk_result =
        esp_lcd_rgb_panel_set_pclk(panel_handle_, pclk_hz);
    if (pclk_result != ESP_OK) {
      storage_transition_ = false;
      return pclk_result;
    }

    // VSYNC is normally masked because Arduino-ESP32 restarts S3 RGB DMA on
    // every VSYNC. The existing one-shot path lets IDF apply the pending PCLK
    // at a real frame boundary and restarts through the canonical FB0 once.
    return restartAfterStorage(wait_ms);
  }

  uint16_t* framebuffer(uint8_t index) const {
    return index < 2 ? framebuffers_[index] : nullptr;
  }

 private:
  static bool IRAM_ATTR onFrameComplete(
      esp_lcd_panel_handle_t panel,
      const esp_lcd_rgb_panel_event_data_t* event_data, void* user_ctx) {
    (void)panel;
    (void)event_data;
    auto* self = static_cast<SuntonAtomicRgbDisplay*>(user_ctx);
    if (self) ++self->frame_complete_count_;
    return false;
  }

  static bool IRAM_ATTR onVsync(
      esp_lcd_panel_handle_t panel,
      const esp_lcd_rgb_panel_event_data_t* event_data, void* user_ctx) {
    (void)panel;
    (void)event_data;
    auto* self = static_cast<SuntonAtomicRgbDisplay*>(user_ctx);
    if (!self || !self->restart_one_shot_armed_) return false;

    // The IDF ISR calls this callback before its restart routine. Masking the
    // hardware bit here prevents future VSYNC interrupts; the current ISR
    // continues and performs exactly one restart through canonical fb0.
    PERIPH_RCC_ATOMIC() {
      lcd_ll_enable_interrupt(&LCD_CAM, LCD_LL_EVENT_RGB, false);
    }
    self->restart_one_shot_armed_ = false;
    self->restart_eof_baseline_ = self->frame_complete_count_;
    self->restart_vsync_seen_ = true;
    return false;
  }

  static void maskVsyncInterrupt() {
    PERIPH_RCC_ATOMIC() {
      lcd_ll_enable_interrupt(&LCD_CAM, LCD_LL_EVENT_RGB, false);
      lcd_ll_clear_interrupt_status(&LCD_CAM, LCD_LL_EVENT_RGB);
    }
  }

  static void enableVsyncInterruptOneShot() {
    PERIPH_RCC_ATOMIC() {
      // A disabled VSYNC source remains latched. Clear it before enabling or
      // the ISR can restart DMA immediately in the middle of an active frame.
      lcd_ll_clear_interrupt_status(&LCD_CAM, LCD_LL_EVENT_RGB);
      lcd_ll_enable_interrupt(&LCD_CAM, LCD_LL_EVENT_RGB, true);
    }
  }

  bool waitForFrameCompletions(uint32_t start, uint32_t count,
                               uint32_t timeout_ms) const {
    const uint32_t started_ms = millis();
    while (static_cast<uint32_t>(frame_complete_count_ - start) < count &&
           millis() - started_ms < timeout_ms) {
      delay(1);
    }
    return static_cast<uint32_t>(frame_complete_count_ - start) >= count;
  }

  esp_lcd_panel_handle_t panel_handle_ = nullptr;
  uint16_t* framebuffers_[2] = {nullptr, nullptr};
  uint8_t active_index_ = 0;
  uint8_t pending_index_ = 0;
  bool atomic_pending_ = false;
  bool storage_transition_ = false;
  bool canonical_fb0_valid_ = true;
  uint32_t atomic_started_ms_ = 0;
  const char* atomic_reason_ = "none";
  volatile uint32_t frame_complete_count_ = 0;
  volatile bool restart_one_shot_armed_ = false;
  volatile bool restart_vsync_seen_ = false;
  volatile uint32_t restart_eof_baseline_ = 0;
};

SuntonAtomicRgbDisplay* g_gfx = nullptr;

bool g_display_ready = false;
bool g_backlight_ready = false;
bool g_touch_ready = false;
bool g_littlefs_ready = false;
uint8_t g_brightness = 0;
uint8_t g_applied_brightness = 0;
uint8_t g_rotation = DeviceSuntonESP328048S070C::kProfile.rotation_default;
uint8_t g_touch_address = 0;
uint16_t g_storage_write_depth = 0;
bool g_storage_blackout_active = false;
bool g_storage_restart_required = false;
bool g_update_check_display_guard_active = false;
uint8_t g_storage_restore_brightness = 0;
uint32_t g_storage_guard_started_ms = 0;
bool g_touch_active = false;
int16_t g_touch_last_x = 0;
int16_t g_touch_last_y = 0;
uint8_t g_touch_status_error_streak = 0;
uint8_t g_touch_point_error_streak = 0;
void ensureStorageLayout() {
  if (!g_littlefs_ready) return;
  LittleFS.mkdir("/_tile_grids");
  LittleFS.mkdir("/_tile_links");
  LittleFS.mkdir("/icons");
}

bool writeTouchRegister(uint16_t reg, uint8_t value) {
  if (!g_touch_address) return false;
  Wire.beginTransmission(g_touch_address);
  Wire.write(static_cast<uint8_t>(reg >> 8));
  Wire.write(static_cast<uint8_t>(reg & 0xFF));
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

bool readTouchRegisters(uint16_t reg, uint8_t* data, size_t len) {
  if (!g_touch_address || !data || len == 0 || len > 32) return false;
  Wire.beginTransmission(g_touch_address);
  Wire.write(static_cast<uint8_t>(reg >> 8));
  Wire.write(static_cast<uint8_t>(reg & 0xFF));
  if (Wire.endTransmission(false) != 0) return false;
  const size_t received =
      Wire.requestFrom(static_cast<int>(g_touch_address), static_cast<int>(len));
  if (received != len) {
    while (Wire.available()) Wire.read();
    return false;
  }
  for (size_t i = 0; i < len; ++i) {
    data[i] = static_cast<uint8_t>(Wire.read());
  }
  return true;
}

bool probeTouchAddress(uint8_t address) {
  Wire.beginTransmission(address);
  if (Wire.endTransmission() != 0) return false;
  g_touch_address = address;
  uint8_t product_id[4] = {};
  if (!readTouchRegisters(kTouchProductIdRegister, product_id,
                          sizeof(product_id))) {
    g_touch_address = 0;
    return false;
  }
  Serial.printf("[Device/Sunton ESP32-8048S070C] GT911 at 0x%02X, id=%c%c%c%c\n",
                address, product_id[0], product_id[1], product_id[2],
                product_id[3]);
  return true;
}

bool initTouch() {
  if (g_touch_ready) return true;
  // Reset the GT911 (INT is not wired, so its address after reset is one of
  // the two it supports), then give it the documented start-up time.
  pinMode(kTouchRst, OUTPUT);
  digitalWrite(kTouchRst, LOW);
  delay(10);
  digitalWrite(kTouchRst, HIGH);
  delay(60);
  Wire.begin(kTouchSda, kTouchScl, kTouchFrequency);
  delay(20);

  if (!probeTouchAddress(kTouchAddressPrimary) &&
      !probeTouchAddress(kTouchAddressAlternate)) {
    Serial.println(
        "[Device/Sunton ESP32-8048S070C] GT911 not found at 0x5D/0x14");
    return false;
  }

  if (!writeTouchRegister(kTouchStatusRegister, 0)) {
    GuitionS3Diagnostics::noteTouchPollIssue(
        GuitionS3Diagnostics::TouchPollIssue::StatusWrite);
  }
  g_touch_active = false;
  g_touch_ready = true;
  return true;
}

bool initBacklight() {
  if (g_backlight_ready) return true;
  pinMode(kBacklightPin, OUTPUT);
  digitalWrite(kBacklightPin, LOW);
  if (!ledcAttach(kBacklightPin, kBacklightFrequency,
                  kBacklightResolution)) {
    Serial.println(
        "[Device/Sunton ESP32-8048S070C] Backlight PWM init failed");
    return false;
  }
  g_backlight_ready = true;
  ledcWrite(kBacklightPin, 0);
#if HOMETILES_GUITION_S3_DIAGNOSTICS_ACTIVE
  Serial.printf(
      "[S3Diag/Display] phase=backlight-init result=ok pin=%d pwm_hz=%lu "
      "resolution_bits=%u duty=0\n",
      kBacklightPin, static_cast<unsigned long>(kBacklightFrequency),
      static_cast<unsigned>(kBacklightResolution));
#endif
  return true;
}

void applyBrightness(uint8_t value, bool remember = true) {
  if (remember) g_brightness = value;
  if (!g_backlight_ready && !initBacklight()) return;
  const uint32_t duty =
      (static_cast<uint32_t>(value) * kBacklightMaxDuty + 127u) / 255u;
  ledcWrite(kBacklightPin, duty);
  g_applied_brightness = value;
}

bool initDisplay() {
  if (g_display_ready) return true;

  g_gfx = new SuntonAtomicRgbDisplay(g_rotation);

  if (!g_gfx || !g_gfx->begin()) {
    Serial.println(
        "[Device/Sunton ESP32-8048S070C] RGB display init failed");
    return false;
  }

  g_gfx->fillScreen(0x0000);
  g_display_ready = true;
  Serial.printf(
      "[Device/Sunton ESP32-8048S070C] Display ready, test=%s, "
      "panel=800x480-rgb, PCLK=%u MHz, bounce=%u rows/%u px, XIP=%u, "
      "cache-line=%u B, "
      "opt=%s, VSYNC-restart=%u, PSRAM free=%u KB\n",
      HOMETILES_GUITION_S3_RGB_TEST_LABEL,
      static_cast<unsigned>(kRgbPclkHz / 1000000),
      static_cast<unsigned>(HOMETILES_GUITION_S3_RGB_BOUNCE_ROWS),
      static_cast<unsigned>(kRgbBounceBufferPixels),
      kHasPsramXip ? 1U : 0U,
      kHasCacheLine64 ? 64U : 32U,
      kCompilerOptimization,
      kRestartInVsync ? 1U : 0U,
      static_cast<unsigned>(
          heap_caps_get_free_size(MALLOC_CAP_SPIRAM) / 1024));
  return true;
}

void mapTouch(uint16_t raw_x, uint16_t raw_y, int16_t& x, int16_t& y) {
  constexpr int16_t kMaxX = kPanelWidth - 1;
  constexpr int16_t kMaxY = kPanelHeight - 1;
  // Landscape panel: the profile offers 0 and 180 degrees only.
  if ((g_rotation & 0x03) == 2) {
    x = kMaxX - static_cast<int16_t>(raw_x);
    y = kMaxY - static_cast<int16_t>(raw_y);
  } else {
    x = static_cast<int16_t>(raw_x);
    y = static_cast<int16_t>(raw_y);
  }
  x = std::max<int16_t>(0, std::min<int16_t>(kMaxX, x));
  y = std::max<int16_t>(0, std::min<int16_t>(kMaxY, y));
}

bool copyFile(fs::FS& src_fs, fs::FS& dst_fs, const char* path) {
  File src = src_fs.open(path, FILE_READ);
  if (!src) return false;
  File dst = dst_fs.open(path, FILE_WRITE);
  if (!dst) {
    src.close();
    return false;
  }
  uint8_t buffer[512];
  while (src.available()) {
    const size_t count = src.read(buffer, sizeof(buffer));
    if (!count || dst.write(buffer, count) != count) break;
  }
  dst.close();
  src.close();
  return true;
}

void copyDirectory(fs::FS& src_fs, fs::FS& dst_fs, const char* dir_path) {
  File dir = src_fs.open(dir_path);
  if (!dir || !dir.isDirectory()) return;
  dst_fs.mkdir(dir_path);

  File entry = dir.openNextFile();
  while (entry) {
    const String path = String(dir_path) + "/" + entry.name();
    const bool directory = entry.isDirectory();
    entry.close();
    if (directory) {
      copyDirectory(src_fs, dst_fs, path.c_str());
    } else if (copyFile(src_fs, dst_fs, path.c_str())) {
      Serial.printf("[Storage] Migrated: %s\n", path.c_str());
    }
    entry = dir.openNextFile();
  }
  dir.close();
}

}  // namespace

bool DeviceSuntonESP328048S070C::init() {
  Serial.println("[Device/Sunton ESP32-8048S070C] Initialising board...");

  if (!psramFound()) {
    Serial.println(
        "[Device/Sunton ESP32-8048S070C] ERROR: octal PSRAM not detected");
    return false;
  }
  Serial.printf(
      "[Device/Sunton ESP32-8048S070C] Flash=%u MB, PSRAM=%u MB\n",
      static_cast<unsigned>(ESP.getFlashChipSize() / (1024 * 1024)),
      static_cast<unsigned>(ESP.getPsramSize() / (1024 * 1024)));

  if (!initBacklight()) return false;
  applyBrightness(0, false);

  // Mount/format LittleFS and create its base directories before the RGB
  // peripheral starts scanning PSRAM. Backlight is already hard-off, so even
  // a long first-install format cannot expose an uninitialised panel.
  if (!initLittleFS()) return false;

  // The first WiFi start after an erased NVS performs a full RF calibration
  // and commits roughly 2 KB of PHY data. Do that one-time operation before
  // RGB/GDMA starts; WiFi.persistent(false) alone only protects WiFi config,
  // not the IDF PHY calibration namespace.
  auto* phy_calibration = static_cast<esp_phy_calibration_data_t*>(
      heap_caps_malloc(sizeof(esp_phy_calibration_data_t),
                       MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  esp_err_t phy_load_err = phy_calibration
                               ? esp_phy_load_cal_data_from_nvs(phy_calibration)
                               : ESP_ERR_NO_MEM;
  if (phy_load_err != ESP_OK) {
    WiFi.persistent(false);
    const bool wifi_started = WiFi.mode(WIFI_STA);
    const bool wifi_stopped = wifi_started && WiFi.mode(WIFI_OFF);
    if (wifi_started && wifi_stopped && phy_calibration) {
      phy_load_err = esp_phy_load_cal_data_from_nvs(phy_calibration);
    }
#if HOMETILES_GUITION_S3_DIAGNOSTICS_ACTIVE
    Serial.printf(
        "[S3Diag/Display] phase=pre-rgb-phy initial=missing "
        "wifi_start=%u wifi_stop=%u stored=%u load=%s(%d)\n",
        wifi_started ? 1u : 0u, wifi_stopped ? 1u : 0u,
        phy_load_err == ESP_OK ? 1u : 0u, esp_err_to_name(phy_load_err),
        static_cast<int>(phy_load_err));
#endif
  } else {
#if HOMETILES_GUITION_S3_DIAGNOSTICS_ACTIVE
    Serial.println(
        "[S3Diag/Display] phase=pre-rgb-phy calibration=present");
#endif
  }
  if (phy_calibration) heap_caps_free(phy_calibration);

  if (!initDisplay()) return false;
#if HOMETILES_GUITION_S3_DIAGNOSTICS_ACTIVE
  Serial.println(
      "[S3Diag/Display] phase=boot-policy littlefs=pre-rgb "
      "normal_restart=skipped vsync_irq=masked");
#endif

  if (!initTouch()) {
    Serial.println(
        "[Device/Sunton ESP32-8048S070C] Touch unavailable; continuing");
  }
  return true;
}

void DeviceSuntonESP328048S070C::update() {
  if (g_gfx) g_gfx->service();
}

void DeviceSuntonESP328048S070C::displayPushPixels(
    int32_t x, int32_t y, int32_t w, int32_t h, const uint16_t* data) {
  if (!g_display_ready || !g_gfx || !data || w <= 0 || h <= 0) return;
  g_gfx->draw16bitRGBBitmap(
      static_cast<int16_t>(x), static_cast<int16_t>(y),
      const_cast<uint16_t*>(data), static_cast<int16_t>(w),
      static_cast<int16_t>(h));
}

void DeviceSuntonESP328048S070C::displayPushPixelsDMA(
    int32_t x, int32_t y, int32_t w, int32_t h, const uint16_t* data) {
  displayPushPixels(x, y, w, h, data);
}

bool DeviceSuntonESP328048S070C::displayTryFullFramePreview(
    int32_t x, int32_t y, int32_t w, int32_t h,
    int32_t source_stride, const uint16_t* data, size_t data_size,
    bool byte_swap) {
  (void)x;
  (void)y;
  (void)w;
  (void)h;
  (void)source_stride;
  (void)data;
  (void)data_size;
  (void)byte_swap;
  return false;
}

bool DeviceSuntonESP328048S070C::displayBeginAtomicFrame(
    const char* reason) {
  return g_display_ready && g_gfx && g_gfx->beginAtomicFrame(reason);
}

void DeviceSuntonESP328048S070C::displayUpdateCheckGuardBegin() {
  if (g_update_check_display_guard_active || !g_display_ready || !g_gfx) {
    return;
  }
  g_update_check_display_guard_active = true;

  uint32_t wait_ms = 0;
  const esp_err_t result =
      g_gfx->setPixelClockAndResynchronize(kUpdateCheckRgbPclkHz, wait_ms);
  if (result == ESP_OK) {
    Serial.printf(
        "[Display/S3] Update-check PCLK reduced to %u MHz in %lu ms\n",
        static_cast<unsigned>(kUpdateCheckRgbPclkHz / 1000000U),
        static_cast<unsigned long>(wait_ms));
  } else {
    Serial.printf(
        "[Display/S3] Update-check PCLK reduction failed: %s (0x%X)\n",
        esp_err_to_name(result), static_cast<unsigned>(result));
  }
}

void DeviceSuntonESP328048S070C::displayUpdateCheckGuardEnd() {
  if (!g_update_check_display_guard_active) return;
  g_update_check_display_guard_active = false;
  if (!g_display_ready || !g_gfx) return;

  uint32_t wait_ms = 0;
  const esp_err_t result =
      g_gfx->setPixelClockAndResynchronize(kRgbPclkHz, wait_ms);
  if (result == ESP_OK) {
    Serial.printf(
        "[Display/S3] Update-check PCLK restored to %u MHz in %lu ms\n",
        static_cast<unsigned>(kRgbPclkHz / 1000000U),
        static_cast<unsigned long>(wait_ms));
  } else {
    Serial.printf(
        "[Display/S3] Update-check PCLK restore failed: %s (0x%X)\n",
        esp_err_to_name(result), static_cast<unsigned>(result));
  }
}

void DeviceSuntonESP328048S070C::displayWaitDMA() {}

void DeviceSuntonESP328048S070C::displayFillScreen(uint16_t color) {
  if (g_display_ready && g_gfx) g_gfx->fillScreen(color);
}

void DeviceSuntonESP328048S070C::displaySetRotation(uint8_t rotation) {
  g_rotation = rotation & 0x03;
  if (g_display_ready && g_gfx) g_gfx->setRotation(g_rotation);
}

void DeviceSuntonESP328048S070C::setBrightness(uint8_t value) {
  applyBrightness(value);
}

uint8_t DeviceSuntonESP328048S070C::getBrightness() {
  return g_brightness;
}

bool DeviceSuntonESP328048S070C::getTouch(int16_t& x, int16_t& y) {
  if (!g_touch_ready && !initTouch()) return false;

  const auto return_held_point = [&]() {
    if (!g_touch_active) return false;
    x = g_touch_last_x;
    y = g_touch_last_y;
    return true;
  };
  const auto return_held_or_fail_safe = [&](uint8_t& error_streak) {
    if (error_streak < UINT8_MAX) ++error_streak;
    if (!g_touch_active || error_streak < kTouchErrorReleaseThreshold) {
      return return_held_point();
    }
    GuitionS3Diagnostics::noteTouchRelease(
        millis(), g_touch_last_x, g_touch_last_y, 0xFF);
    g_touch_active = false;
    g_touch_status_error_streak = 0;
    g_touch_point_error_streak = 0;
    return false;
  };

  uint8_t status = 0;
  if (!readTouchRegisters(kTouchStatusRegister, &status, 1)) {
    GuitionS3Diagnostics::noteTouchPollIssue(
        GuitionS3Diagnostics::TouchPollIssue::StatusRead);
    return return_held_or_fail_safe(g_touch_status_error_streak);
  }
  g_touch_status_error_streak = 0;
  if ((status & 0x80) == 0) {
    // Bit 7 means "new coordinate frame ready", not "finger down". Keep the
    // previous active point until GT911 explicitly publishes a ready frame
    // with zero points. This mirrors Espressif's GT911 driver semantics and
    // prevents artificial RELEASE/CLICK cycles between controller reports.
    GuitionS3Diagnostics::noteTouchPollIssue(
        GuitionS3Diagnostics::TouchPollIssue::NoNewFrame);
    return return_held_point();
  }

  const uint8_t points = status & 0x0F;
  if (points == 0) {
    if (!writeTouchRegister(kTouchStatusRegister, 0)) {
      GuitionS3Diagnostics::noteTouchPollIssue(
          GuitionS3Diagnostics::TouchPollIssue::StatusWrite);
    }
    if (g_touch_active) {
      GuitionS3Diagnostics::noteTouchRelease(
          millis(), g_touch_last_x, g_touch_last_y, status);
    }
    g_touch_active = false;
    g_touch_point_error_streak = 0;
    return false;
  }
  if (points > 5) {
    if (!writeTouchRegister(kTouchStatusRegister, 0)) {
      GuitionS3Diagnostics::noteTouchPollIssue(
          GuitionS3Diagnostics::TouchPollIssue::StatusWrite);
    }
    GuitionS3Diagnostics::noteTouchPollIssue(
        GuitionS3Diagnostics::TouchPollIssue::InvalidPointCount);
    return return_held_or_fail_safe(g_touch_point_error_streak);
  }

  uint8_t point[8] = {};
  const bool read_ok =
      readTouchRegisters(kTouchPointRegister, point, sizeof(point));
  if (!writeTouchRegister(kTouchStatusRegister, 0)) {
    GuitionS3Diagnostics::noteTouchPollIssue(
        GuitionS3Diagnostics::TouchPollIssue::StatusWrite);
  }
  if (!read_ok) {
    GuitionS3Diagnostics::noteTouchPollIssue(
        GuitionS3Diagnostics::TouchPollIssue::PointRead);
    return return_held_or_fail_safe(g_touch_point_error_streak);
  }

  const uint16_t raw_x =
      static_cast<uint16_t>(point[1] | (point[2] << 8));
  const uint16_t raw_y =
      static_cast<uint16_t>(point[3] | (point[4] << 8));
  if (raw_x >= kPanelWidth || raw_y >= kPanelHeight) {
    GuitionS3Diagnostics::noteTouchPollIssue(
        GuitionS3Diagnostics::TouchPollIssue::InvalidCoordinates);
    return return_held_or_fail_safe(g_touch_point_error_streak);
  }

  g_touch_point_error_streak = 0;
  mapTouch(raw_x, raw_y, x, y);
  g_touch_last_x = x;
  g_touch_last_y = y;
  if (!g_touch_active) {
    g_touch_active = true;
    GuitionS3Diagnostics::noteTouchDown(millis(), x, y, raw_x, raw_y,
                                        status);
  }
  return true;
}

void DeviceSuntonESP328048S070C::displaySleep() {
  applyBrightness(0, false);
}

void DeviceSuntonESP328048S070C::displayWake() {
  applyBrightness(g_brightness ? g_brightness : 160, false);
}

void DeviceSuntonESP328048S070C::displayWakeDark() {
  applyBrightness(0, false);
}

void DeviceSuntonESP328048S070C::displayPowerSaveOn() {
  displaySleep();
}

void DeviceSuntonESP328048S070C::displayPowerSaveOff() {
  displayWake();
}

void DeviceSuntonESP328048S070C::displayWaitDisplay() {
  if (g_display_ready && g_gfx) g_gfx->commitAtomicFrame();
}

void DeviceSuntonESP328048S070C::prepareForRestart() {
  applyBrightness(0, false);
  if (g_display_ready && g_gfx) {
    g_gfx->fillScreen(0x0000);
    g_gfx->flush(true);
  }
  delay(20);
}

// The board has a microSD slot, but its pins are not verified for HomeTiles yet:
// the profile keeps everything on LittleFS.
bool DeviceSuntonESP328048S070C::initSDCard() { return false; }

bool DeviceSuntonESP328048S070C::storageReady() {
  return g_littlefs_ready;
}

fs::FS& DeviceSuntonESP328048S070C::storageFS() {
  return LittleFS;
}

void DeviceSuntonESP328048S070C::storageWriteBegin() {
  if (g_storage_write_depth < UINT16_MAX) {
    ++g_storage_write_depth;
  }
  if (g_storage_write_depth != 1) return;

  // Espressif's supported bounce mode is safe across main-flash writes only
  // with PSRAM XIP and a 64-byte S3 cache line. The stock Arduino SDK has
  // neither. Mark the continuous RGB stream for an explicit restart and hide
  // the short underflow while the flash cache is unavailable.
  if (kHasPsramXip && kHasCacheLine64) return;
  if (!g_display_ready) return;

  g_storage_restart_required = true;
  const bool blackout = g_backlight_ready && g_applied_brightness != 0;
  g_storage_guard_started_ms = millis();
  GuitionS3Diagnostics::noteStorageGuardBegin(blackout);
  if (blackout) {
    g_storage_blackout_active = true;
    g_storage_restore_brightness = g_applied_brightness;
    applyBrightness(0, false);
    delay(2);
  }

  // IDF's ESP32-S3 restart descriptor is permanently wired to framebuffer 0.
  // Canonicalize while the established storage blackout is active, before the
  // flash cache can be disabled by the caller.
  if (g_gfx && !g_gfx->canonicalizeForStorage()) {
    Serial.println(
        "[Display/S3] Failed to canonicalize framebuffer before flash write");
  }
}

void DeviceSuntonESP328048S070C::storageWriteEnd() {
  if (g_storage_write_depth == 0) return;
  --g_storage_write_depth;
  if (g_storage_write_depth != 0) return;

  const bool restart_required = g_storage_restart_required;
  const bool restore_backlight = g_storage_blackout_active;
  const uint8_t restore_brightness = g_storage_restore_brightness;
  g_storage_restart_required = false;
  g_storage_blackout_active = false;
  g_storage_restore_brightness = 0;

  if (restart_required) {
    uint32_t restart_wait_ms = 0;
    const esp_err_t restart_result =
        g_gfx ? g_gfx->restartAfterStorage(restart_wait_ms)
              : ESP_ERR_INVALID_STATE;
    if (restart_result != ESP_OK) {
      Serial.printf(
          "[Display/S3] RGB restart after flash write failed: %s (0x%X)\n",
          esp_err_to_name(restart_result),
          static_cast<unsigned>(restart_result));
    }

    GuitionS3Diagnostics::noteRgbRestart(
        static_cast<int32_t>(restart_result), restart_wait_ms);
  }

  if (restore_backlight) applyBrightness(restore_brightness, false);
  if (restart_required) {
    GuitionS3Diagnostics::noteStorageGuardEnd(
        millis() - g_storage_guard_started_ms);
    g_storage_guard_started_ms = 0;
  }
}

bool DeviceSuntonESP328048S070C::sdReady() { return false; }

fs::FS& DeviceSuntonESP328048S070C::sdFS() { return LittleFS; }

bool DeviceSuntonESP328048S070C::suspendSDCardForNetworkTransition() {
  return false;
}

bool DeviceSuntonESP328048S070C::resumeSDCardAfterNetworkTransition() {
  return false;
}

bool DeviceSuntonESP328048S070C::initLittleFS() {
  if (g_littlefs_ready) return true;
  if (!LittleFS.begin(true, "/littlefs", 10, "spiffs")) {
    Serial.println(
        "[Device/Sunton ESP32-8048S070C] LittleFS mount failed");
    return false;
  }
  g_littlefs_ready = true;
  ensureStorageLayout();
  Serial.printf(
      "[Device/Sunton ESP32-8048S070C] LittleFS ready, total=%u, used=%u\n",
      static_cast<unsigned>(LittleFS.totalBytes()),
      static_cast<unsigned>(LittleFS.usedBytes()));
  return true;
}

void DeviceSuntonESP328048S070C::migrateStorageFromSD() {
  if (!initLittleFS() || LittleFS.exists("/_migrated")) return;

  storageWriteBegin();
  ensureStorageLayout();
  Serial.println("[Storage] No SD card on this profile, starting fresh");

  File flag = LittleFS.open("/_migrated", FILE_WRITE);
  if (flag) {
    flag.print("1");
    flag.close();
  }
  storageWriteEnd();
}

#endif  // defined(DEVICE_SUNTON_ESP32_8048S070C)
