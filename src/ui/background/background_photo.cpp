#include "src/ui/background/background_photo.h"

#include <FS.h>
#include <lvgl.h>
#include <string.h>
#include <algorithm>
#include <atomic>

#include "src/core/config/config_manager.h"
#include "src/devices/device.h"
#include "src/tiles/config/tile_config.h"
#include "src/ui/background/jpeg_probe.h"
#include "src/ui/screensaver/image_screensaver.h"
#include "src/ui/shared/ui_surface_style.h"
#include "src/ui/tabs/tiles/tab_tiles_unified.h"

namespace background_photo {
namespace {

using background_rules::Reason;
using background_rules::Status;

constexpr uint32_t kBootProbeDelayMs = 1500;
// Gives the 17 ms refresh timer time to draw "Loading" before the decode
// blocks the UI thread.
constexpr uint32_t kDecodeDelayMs = 50;

std::atomic<bool> g_apply_requested{false};
Status g_status = Status::None;
Reason g_reason = Reason::Usable;
lv_obj_t* g_image = nullptr;
lv_image_dsc_t* g_dsc = nullptr;
char g_shown_name[background_rules::kMaxPhotoName] = "";
uint8_t g_shown_dim = 0;
lv_timer_t* g_decode_timer = nullptr;
char g_pending_name[background_rules::kMaxPhotoName] = "";
uint8_t g_pending_dim = 0;
uint8_t g_pending_orientation = 1;

// jpeg_probe::probe reader over an open file.
struct FileReader {
  fs::File& file;
  size_t operator()(uint32_t offset, uint8_t* dst, size_t len) {
    return file.seek(offset) ? file.read(dst, len) : 0;
  }
};

// Cards take the tile opacity when they are rendered (render_tile).
void reload_tiles() {
  tiles_invalidate_folder(tileConfig.rootFolderId());
  tiles_request_reload_all();
}

void cancel_decode() {
  if (!g_decode_timer) return;
  lv_timer_delete(g_decode_timer);
  g_decode_timer = nullptr;
}

// Back to black with solid tiles; the saved choice stays.
void clear(Status status, Reason reason) {
  cancel_decode();
  const bool was_shown = g_dsc != nullptr;
  if (g_image) {
    lv_obj_delete(g_image);
    g_image = nullptr;
  }
  image_screensaver_free_decoded(g_dsc);
  g_dsc = nullptr;
  g_shown_name[0] = '\0';
  g_status = status;
  g_reason = reason;
  ui_surface_style::set_photo_backdrop(false, 100);
  if (was_shown) reload_tiles();
}

const char* failure_name(ImageDecodeFailure failure) {
  switch (failure) {
    case ImageDecodeFailure::NotFound: return "not found";
    case ImageDecodeFailure::NoMemory: return "no memory";
    case ImageDecodeFailure::TooLarge: return "too large";
    default: return "unreadable";
  }
}

}  // namespace

static void decode_timer_cb(lv_timer_t*) {
  g_decode_timer = nullptr;
  lv_display_t* disp = lv_display_get_default();
  const uint16_t w = static_cast<uint16_t>(lv_display_get_horizontal_resolution(disp));
  const uint16_t h = static_cast<uint16_t>(lv_display_get_vertical_resolution(disp));
  const uint32_t started = millis();
  ImageDecodeFailure failure = ImageDecodeFailure::None;
  lv_image_dsc_t* dsc =
      image_screensaver_decode_full_cover(g_pending_name, w, h, g_pending_orientation, &failure);
  if (!dsc) {
    Serial.printf("[BG] failed %s: %s\n", g_pending_name, failure_name(failure));
    if (failure == ImageDecodeFailure::NotFound) clear(Status::NotFound, Reason::Usable);
    else if (failure == ImageDecodeFailure::NoMemory) clear(Status::NoMemory, Reason::Usable);
    else if (failure == ImageDecodeFailure::TooLarge) clear(Status::Unusable, Reason::TooLarge);
    else clear(Status::Unusable, Reason::Unreadable);
    return;
  }
  // The dim works on native RGB565: swap a swapped decode first, and swap back
  // for a display that takes swapped pixels (Tab5).
  const bool display_swapped = lv_display_get_color_format(disp) == LV_COLOR_FORMAT_RGB565_SWAPPED;
  const size_t pixels = static_cast<size_t>(dsc->header.w) * dsc->header.h;
  uint16_t* px = reinterpret_cast<uint16_t*>(const_cast<uint8_t*>(dsc->data));
  background_rules::finish_pixels(px, pixels, g_pending_dim,
                                  dsc->header.cf == LV_COLOR_FORMAT_RGB565_SWAPPED);
  if (display_swapped) background_rules::finish_pixels(px, pixels, 0, true);
  dsc->header.cf = display_swapped ? LV_COLOR_FORMAT_RGB565_SWAPPED : LV_COLOR_FORMAT_RGB565;

  if (!g_image) {
    // The screen's first child: behind the transparent tile layers.
    g_image = lv_image_create(lv_screen_active());
    lv_obj_remove_flag(g_image, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_pos(g_image, 0, 0);
  }
  lv_obj_move_to_index(g_image, 0);
  lv_image_set_src(g_image, dsc);
  image_screensaver_free_decoded(g_dsc);  // no longer drawn
  g_dsc = dsc;
  strlcpy(g_shown_name, g_pending_name, sizeof(g_shown_name));
  g_shown_dim = g_pending_dim;
  g_status = Status::Shown;
  g_reason = Reason::Usable;
  ui_surface_style::set_photo_backdrop(true, effective_tile_opacity());
  reload_tiles();
  Serial.printf("[BG] decode %s ms=%lu\n", g_shown_name, static_cast<unsigned long>(millis() - started));
}

static void boot_timer_cb(lv_timer_t*) {
  // One more probe for a card that was slow at boot. Without a chosen photo
  // the card is left alone.
  if (configManager.getConfig().background_photo[0]) Device::sdReady();
  request_apply();
}

bool list(std::vector<Entry>& out) {
  out.clear();
  if (!Device::sdReadyCached()) return false;
  const uint32_t started = millis();
  fs::File dir = Device::sdFS().open("/images");
  // ponytail: first 100 in directory order, then sorted; scan everything if owners hit the cap
  while (dir && dir.isDirectory() && out.size() < background_rules::kMaxListed) {
    fs::File file = dir.openNextFile();
    if (!file) break;
    const char* name = file.name();
    if (file.isDirectory() || !background_rules::is_listed_name(name)) continue;
    const uint32_t size = file.size();
    Reason reason = background_rules::reason_for(name, size, jpeg_probe::Kind::Baseline);
    if (reason == Reason::Usable) {
      reason = background_rules::reason_for(name, size, jpeg_probe::probe(FileReader{file}, size, false));
    }
    out.push_back({String(name), reason});
  }
  std::sort(out.begin(), out.end(), [](const Entry& a, const Entry& b) {
    return background_rules::compare_names(a.name.c_str(), b.name.c_str()) < 0;
  });
  Serial.printf("[BG] list n=%u ms=%lu\n", static_cast<unsigned>(out.size()),
                static_cast<unsigned long>(millis() - started));
  return true;
}

Reason check(const char* name, bool* exists, uint8_t* orientation) {
  bool found = false;
  uint8_t turn = 1;
  Reason reason = Reason::BadName;
  if (background_rules::is_safe_name(name)) {
    reason = Reason::Unreadable;
    fs::File file;
    if (Device::sdReadyCached()) file = Device::sdFS().open(String("/images/") + name, FILE_READ);
    if (file && !file.isDirectory()) {
      found = true;
      const uint32_t size = file.size();
      reason = background_rules::reason_for(name, size, jpeg_probe::Kind::Baseline);
      if (reason == Reason::Usable) {
        const jpeg_probe::Info info = jpeg_probe::probe(FileReader{file}, size, orientation != nullptr);
        reason = background_rules::reason_for(name, size, info);
        turn = info.orientation;
      }
    }
  }
  if (exists) *exists = found;
  if (orientation) *orientation = turn;
  return reason;
}

void begin() {
  lv_timer_t* timer = lv_timer_create(boot_timer_cb, kBootProbeDelayMs, nullptr);
  if (timer) lv_timer_set_repeat_count(timer, 1);
}

void request_apply() { g_apply_requested.store(true); }

void process_pending() {
  if (!g_apply_requested.exchange(false)) return;
  const DeviceConfig& cfg = configManager.getConfig();
  if (!cfg.background_photo[0]) {
    clear(Status::None, Reason::Usable);
    return;
  }
  if (g_dsc && strcmp(g_shown_name, cfg.background_photo) == 0 && g_shown_dim == cfg.background_dim) {
    // Only the opacity changed, or the choice went back to the shown photo.
    cancel_decode();
    g_status = Status::Shown;
    g_reason = Reason::Usable;
    ui_surface_style::set_photo_backdrop(true, effective_tile_opacity());
    reload_tiles();
    return;
  }
  bool exists = false;
  uint8_t orientation = 1;
  const Reason reason = check(cfg.background_photo, &exists, &orientation);
  const Status status =
      background_rules::status_before_decode(true, Device::sdReadyCached(), exists, reason);
  if (status != Status::Loading) {
    clear(status, reason);
    return;
  }
  cancel_decode();
  strlcpy(g_pending_name, cfg.background_photo, sizeof(g_pending_name));
  g_pending_dim = cfg.background_dim;
  g_pending_orientation = orientation;
  g_status = Status::Loading;
  g_reason = Reason::Usable;
  g_decode_timer = lv_timer_create(decode_timer_cb, kDecodeDelayMs, nullptr);
  if (g_decode_timer) lv_timer_set_repeat_count(g_decode_timer, 1);
}

Status status() { return g_status; }

Reason unusable_reason() { return g_reason; }

uint8_t effective_tile_opacity() {
  return std::max(configManager.getConfig().tile_opacity, Device::kTileOpacityPercentMin);
}

const char* status_text(const i18n::Strings& s) {
  switch (g_status) {
    case Status::None:
    case Status::Shown: return s.background_hint;
    case Status::Loading: return s.background_loading;
    case Status::NoCard: return s.background_no_card;
    case Status::NotFound: return s.background_not_found;
    case Status::NoMemory: return s.background_no_memory;
    case Status::Unusable: return reason_text(g_reason, s);
  }
  return s.background_hint;
}

const char* reason_text(Reason reason, const i18n::Strings& s) {
  switch (reason) {
    case Reason::Progressive: return s.background_cant_progressive;
    case Reason::TooBig: return s.background_cant_too_big;
    case Reason::TooLarge: return s.background_cant_too_large;
    case Reason::Unreadable: return s.background_cant_unreadable;
    case Reason::BadName: return s.background_cant_name;
    case Reason::Usable: break;
  }
  return "";
}

}  // namespace background_photo
