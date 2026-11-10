// Behaviour of the background photo runtime (src/ui/background/background_photo.cpp)
// on real LVGL with a fake card, settings, decoder and tile grid: the list, what
// each saved choice shows, the popup status, that every decoded buffer is freed
// exactly once, and that tiles reload only around a shown photo.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {lvglHost} from '../../lib/lvgl-host.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// The fakes below declare what the runtime calls; keep them equal to the real headers.
for (const [file, declaration] of [
  ['src/devices/device.h', 'bool sdReady();'],
  ['src/devices/device.h', 'bool sdReadyCached();'],
  ['src/devices/device.h', 'fs::FS& sdFS();'],
  ['src/ui/shared/ui_surface_style.h', 'void set_photo_backdrop(bool shown, uint8_t tile_opacity_pct);'],
  ['src/ui/tabs/tiles/tab_tiles_unified.h', 'void tiles_request_reload_all();'],
  ['src/ui/tabs/tiles/tab_tiles_unified.h', 'void tiles_invalidate_folder(uint16_t folder_id);'],
  ['src/ui/screensaver/image_screensaver.h', 'lv_image_dsc_t* image_screensaver_decode_full_cover(const char* name, uint16_t w, uint16_t h, uint8_t orientation, ImageDecodeFailure* failure);'],
  ['src/ui/screensaver/image_screensaver.h', 'void image_screensaver_free_decoded(lv_image_dsc_t* dsc);'],
]) {
  assert.ok(read(file).includes(declaration), `${file} declares ${declaration}`);
}
const failureEnum = read('src/ui/screensaver/image_screensaver.h').match(/enum class ImageDecodeFailure[^;]*;/);
assert.ok(failureEnum, 'ImageDecodeFailure is missing');

const host = await lvglHost(root);
if (!host) {
  console.log('SKIP: background runtime behaviour requires LVGL and a host compiler (declarations checked)');
  process.exit(0);
}
const out = path.join(root, 'build/tests/background-runtime');
// Shadows the real headers: -I out comes first.
const stub = (file, text) => {
  fs.mkdirSync(path.dirname(path.join(out, file)), {recursive: true});
  fs.writeFileSync(path.join(out, file), text);
};
stub('Arduino.h', `#pragma once
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <string>
uint32_t millis();
struct HostSerial { void printf(const char*, ...) {} void println(const char*) {} };
extern HostSerial Serial;
class String : public std::string {
 public:
  using std::string::string;
  String() = default;
  String(const std::string& s) : std::string(s) {}
};
#define FILE_READ "r"
`);
stub('FS.h', `#pragma once
#include <Arduino.h>
#include <algorithm>
#include <vector>
namespace fs {
// The card's /images folder, in directory order.
struct FakeFile { std::string name; std::vector<uint8_t> bytes; bool directory = false; };
extern std::vector<FakeFile> card;
class File {
 public:
  File() = default;
  File(const FakeFile* file, bool folder) : file_(file), folder_(folder) {}
  explicit operator bool() const { return file_ || folder_; }
  bool isDirectory() const { return folder_ || (file_ && file_->directory); }
  const char* name() const { return file_ ? file_->name.c_str() : "images"; }
  size_t size() const { return file_ ? file_->bytes.size() : 0; }
  bool seek(uint32_t pos) { pos_ = pos; return file_ && pos <= file_->bytes.size(); }
  size_t read(uint8_t* dst, size_t len) {
    if (!file_ || pos_ >= file_->bytes.size()) return 0;
    const size_t n = std::min(len, file_->bytes.size() - pos_);
    memcpy(dst, file_->bytes.data() + pos_, n);
    pos_ += n;
    return n;
  }
  File openNextFile() { return folder_ && next_ < card.size() ? File(&card[next_++], false) : File(); }
 private:
  const FakeFile* file_ = nullptr;
  bool folder_ = false;
  size_t pos_ = 0;
  size_t next_ = 0;
};
class FS {
 public:
  File open(const String& path, const char* = FILE_READ) {
    if (path == "/images") return File(nullptr, true);
    for (const FakeFile& file : card) if (path == "/images/" + file.name) return File(&file, false);
    return File();
  }
};
}  // namespace fs
`);
stub('src/devices/device.h', `#pragma once
#include <FS.h>
namespace Device {
inline constexpr uint8_t kTileOpacityPercentMin = 10;  // a board floor, to see it applied
bool sdReady();
bool sdReadyCached();
fs::FS& sdFS();
}
`);
// Read-only, so the runtime has no way to write settings.
stub('src/core/config/config_manager.h', `#pragma once
#include "src/ui/background/background_rules.h"
struct DeviceConfig {
  char background_photo[background_rules::kMaxPhotoName] = "";
  uint8_t tile_opacity = background_rules::kDefaultTileOpacity;
  uint8_t background_dim = background_rules::kDefaultDim;
};
struct ConfigManager {
  DeviceConfig config;
  const DeviceConfig& getConfig() const { return config; }
};
extern ConfigManager configManager;
`);
stub('src/tiles/config/tile_config.h', `#pragma once
#include <cstdint>
class TileConfig { public: static constexpr uint16_t rootFolderId() { return 0; } };
extern TileConfig tileConfig;
`);
stub('src/ui/screensaver/image_screensaver.h', `#pragma once
#include <lvgl.h>
${failureEnum[0]}
lv_image_dsc_t* image_screensaver_decode_full_cover(const char* name, uint16_t w, uint16_t h, uint8_t orientation, ImageDecodeFailure* failure);
void image_screensaver_free_decoded(lv_image_dsc_t* dsc);
`);
stub('src/ui/shared/ui_surface_style.h', `#pragma once
#include <cstdint>
namespace ui_surface_style { void set_photo_backdrop(bool shown, uint8_t tile_opacity_pct); }
`);
stub('src/ui/tabs/tiles/tab_tiles_unified.h', `#pragma once
#include <cstdint>
void tiles_request_reload_all();
void tiles_invalidate_folder(uint16_t folder_id);
`);

const cpp = String.raw`
#include <Arduino.h>
#include <lvgl.h>
#include <cassert>
#include <cstdio>
#include <cstdlib>
#include <set>
#include "src/core/config/config_manager.h"
#include "src/devices/device.h"
#include "src/tiles/config/tile_config.h"
#include "src/ui/background/background_photo.h"
#include "src/ui/screensaver/image_screensaver.h"
#include "src/ui/shared/ui_surface_style.h"
#include "src/ui/tabs/tiles/tab_tiles_unified.h"

using background_rules::Reason;
using background_rules::Status;

uint32_t now_ms = 0;
uint32_t millis() { return now_ms; }
HostSerial Serial;
ConfigManager configManager;
TileConfig tileConfig;
std::vector<fs::FakeFile> fs::card;

bool card_ready = true;
int card_probes = 0;
fs::FS card_fs;
bool Device::sdReady() { ++card_probes; return card_ready; }
bool Device::sdReadyCached() { return card_ready; }
fs::FS& Device::sdFS() { return card_fs; }

int reloads = 0;
void tiles_invalidate_folder(uint16_t folder_id) { assert(folder_id == 0 && "the Home grid"); }
void tiles_request_reload_all() { ++reloads; }

bool backdrop_shown = false;
int backdrop_opacity = -1;
void ui_surface_style::set_photo_backdrop(bool shown, uint8_t pct) { backdrop_shown = shown; backdrop_opacity = pct; }

// A white w x h RGB565 photo, unless a failure is queued.
ImageDecodeFailure next_failure = ImageDecodeFailure::None;
std::vector<std::string> decoded;  // "name@orientation", one per call
std::set<const lv_image_dsc_t*> live;
lv_image_dsc_t* image_screensaver_decode_full_cover(const char* name, uint16_t w, uint16_t h, uint8_t orientation,
                                                    ImageDecodeFailure* failure) {
  decoded.push_back(std::string(name) + "@" + std::to_string(orientation));
  *failure = next_failure;
  if (next_failure != ImageDecodeFailure::None) return nullptr;
  auto* dsc = static_cast<lv_image_dsc_t*>(calloc(1, sizeof(lv_image_dsc_t)));
  const size_t pixels = static_cast<size_t>(w) * h;
  auto* px = static_cast<uint16_t*>(malloc(pixels * 2));
  for (size_t i = 0; i < pixels; ++i) px[i] = 0xFFFF;
  dsc->header.magic = LV_IMAGE_HEADER_MAGIC;
  dsc->header.cf = LV_COLOR_FORMAT_RGB565;
  dsc->header.w = w;
  dsc->header.h = h;
  dsc->header.stride = w * 2;
  dsc->data = reinterpret_cast<const uint8_t*>(px);
  dsc->data_size = pixels * 2;
  live.insert(dsc);
  return dsc;
}
void image_screensaver_free_decoded(lv_image_dsc_t* dsc) {
  if (!dsc) return;
  assert(live.erase(dsc) == 1 && "each decoded buffer is freed exactly once");
  free(const_cast<uint8_t*>(dsc->data));
  free(dsc);
}

// SOI, an optional EXIF APP1 with the orientation tag, and a frame header.
std::vector<uint8_t> jpeg(uint16_t w, uint16_t h, uint8_t sof = 0xC0, uint8_t orientation = 1) {
  std::vector<uint8_t> b = {0xFF, 0xD8};
  if (orientation != 1) {
    const uint8_t app1[] = {0xFF, 0xE1, 0x00, 0x22, 'E', 'x', 'i', 'f', 0, 0, 'M', 'M', 0, 0x2A, 0, 0, 0, 8, 0, 1,
                            0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0};
    b.insert(b.end(), app1, app1 + sizeof(app1));
  }
  const uint8_t frame[] = {0xFF, sof, 0x00, 0x11, 8, uint8_t(h >> 8), uint8_t(h), uint8_t(w >> 8), uint8_t(w), 3,
                           1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1};
  b.insert(b.end(), frame, frame + sizeof(frame));
  return b;
}
void put(const char* name, std::vector<uint8_t> bytes) { fs::card.push_back({name, std::move(bytes)}); }
void remove_file(const char* name) {
  for (auto it = fs::card.begin(); it != fs::card.end(); ++it) {
    if (it->name == name) { fs::card.erase(it); return; }
  }
}
void choose(const char* photo, uint8_t opacity = 60, uint8_t dim = 25) {
  strlcpy(configManager.config.background_photo, photo, sizeof(configManager.config.background_photo));
  configManager.config.tile_opacity = opacity;
  configManager.config.background_dim = dim;
}
// What a settings change does: request, then the next UI pass.
void apply() {
  background_photo::request_apply();
  background_photo::process_pending();
}
void run_timers(uint32_t ms) {
  now_ms += ms;
  lv_timer_handler();
}
lv_obj_t* first_child() { return lv_obj_get_child(lv_screen_active(), 0); }
uint32_t children() { return lv_obj_get_child_count(lv_screen_active()); }
uint16_t first_pixel() { return reinterpret_cast<const uint16_t*>((*live.begin())->data)[0]; }

int main() {
  lv_init();
  lv_tick_set_cb([]() -> uint32_t { return now_ms; });
  lv_display_create(800, 480);
  lv_obj_t* tiles = lv_obj_create(lv_screen_active());  // the tile layers
  i18n::Strings s{};
  s.background_hint = "hint";
  s.background_loading = "loading";
  s.background_no_card = "no card";
  s.background_not_found = "not found";
  s.background_no_memory = "no memory";
  s.background_cant_progressive = "progressive";
  s.background_cant_too_big = "too big";
  s.background_cant_too_large = "too large";
  s.background_cant_unreadable = "unreadable";
  s.background_cant_name = "name";

  put("b.jpg", jpeg(1600, 1200));
  put(".b.jpg", jpeg(1600, 1200));
  put("A.JPG", jpeg(2048, 2048, 0xC0, 6));
  put("notes.txt", {1, 2, 3});
  put("prog.jpg", jpeg(1600, 1200, 0xC2));
  put("huge.jpg", jpeg(4000, 3000));
  put("big.jpg", std::vector<uint8_t>(background_rules::kMaxFileBytes + 1, 0));
  put("broken.jpg", {0xFF, 0xD8, 0xFF});
  fs::card.push_back({"sub.jpg", {}, true});

  // The list: sorted; dot-files, other types and folders skipped; reasons from the header.
  std::vector<background_photo::Entry> entries;
  assert(background_photo::list(entries));
  std::string listed;
  for (const auto& entry : entries) listed += entry.name + "(" + background_photo::reason_text(entry.reason, s) + ") ";
  assert(listed == "A.JPG() b.jpg() big.jpg(too big) broken.jpg(unreadable) huge.jpg(too large) prog.jpg(progressive) ");
  card_ready = false;
  assert(!background_photo::list(entries) && entries.empty());
  card_ready = true;

  // Boot: one card probe 1.5 s after begin() for a chosen photo, then the decode.
  choose("A.JPG", 40, 0);
  background_photo::begin();
  run_timers(1499);
  assert(card_probes == 0);
  run_timers(1);
  assert(card_probes == 1 && background_photo::status() == Status::None && "applied on the next UI pass");
  background_photo::process_pending();
  assert(background_photo::status() == Status::Loading && !strcmp(background_photo::status_text(s), "loading"));
  assert(decoded.empty() && "the decode waits for its timer, so Loading can be drawn");
  run_timers(50);
  assert(decoded.size() == 1 && decoded[0] == "A.JPG@6" && "the EXIF orientation reaches the decoder");
  assert(background_photo::status() == Status::Shown && !strcmp(background_photo::status_text(s), "hint"));
  lv_obj_t* photo = first_child();
  assert(photo != tiles && lv_obj_get_class(photo) == &lv_image_class && "the photo sits behind the tiles");
  assert(children() == 2 && !lv_obj_has_flag(photo, LV_OBJ_FLAG_CLICKABLE));
  assert(lv_image_get_src(photo) == *live.begin() && first_pixel() == 0xFFFF && "dim 0 keeps the pixels");
  assert(backdrop_shown && backdrop_opacity == 40 && reloads == 1 && live.size() == 1);
  background_photo::process_pending();
  assert(decoded.size() == 1 && reloads == 1 && "nothing happens without a request");

  // Opacity only: the same buffer, no decode; the tiles reload at the new opacity.
  choose("A.JPG", 5, 0);
  apply();
  assert(decoded.size() == 1 && live.size() == 1 && background_photo::status() == Status::Shown);
  assert(backdrop_opacity == 10 && background_photo::effective_tile_opacity() == 10 && "never below the floor");
  assert(reloads == 2 && first_child() == photo);

  // Dim: a new decode, dimmed once; the old buffer goes after the swap.
  choose("A.JPG", 60, 50);
  apply();
  run_timers(50);
  assert(decoded.size() == 2 && live.size() == 1 && first_child() == photo && children() == 2);
  assert(lv_image_get_src(photo) == *live.begin() && first_pixel() == 0x8410 && reloads == 3);

  // A change while a decode waits: only the newest choice is decoded.
  choose("b.jpg");
  apply();
  choose("A.JPG");
  apply();
  run_timers(100);
  assert(decoded.size() == 3 && decoded[2] == "A.JPG@6" && reloads == 4);
  // Back to the shown photo while another one waits: the wait is cancelled.
  choose("b.jpg");
  apply();
  assert(background_photo::status() == Status::Loading);
  choose("A.JPG");
  apply();
  run_timers(100);
  assert(decoded.size() == 3 && background_photo::status() == Status::Shown && reloads == 5);

  // A photo that can't be used: no photo, solid tiles, the choice stays.
  choose("huge.jpg");
  apply();
  assert(background_photo::status() == Status::Unusable && background_photo::unusable_reason() == Reason::TooLarge);
  assert(!strcmp(background_photo::status_text(s), "too large") && decoded.size() == 3 && "refused from the header");
  assert(live.empty() && children() == 1 && first_child() == tiles);
  assert(!backdrop_shown && backdrop_opacity == 100 && reloads == 6);
  assert(!strcmp(configManager.getConfig().background_photo, "huge.jpg"));

  // Nothing is shown now, so the tiles stay as they are.
  const std::pair<const char*, Reason> unusable[] = {
      {"prog.jpg", Reason::Progressive}, {"big.jpg", Reason::TooBig}, {"broken.jpg", Reason::Unreadable}};
  for (const auto& [name, reason] : unusable) {
    choose(name);
    apply();
    assert(background_photo::status() == Status::Unusable && background_photo::unusable_reason() == reason);
  }
  choose("missing.jpg");
  apply();
  assert(background_photo::status() == Status::NotFound && !strcmp(background_photo::status_text(s), "not found"));
  card_ready = false;
  choose("A.JPG");
  apply();
  assert(background_photo::status() == Status::NoCard && !strcmp(background_photo::status_text(s), "no card"));
  card_ready = true;
  assert(decoded.size() == 3 && reloads == 6 && children() == 1);

  // The decoder's own failures.
  const std::pair<ImageDecodeFailure, Status> failures[] = {
      {ImageDecodeFailure::NoMemory, Status::NoMemory}, {ImageDecodeFailure::TooLarge, Status::Unusable},
      {ImageDecodeFailure::Unreadable, Status::Unusable}, {ImageDecodeFailure::NotFound, Status::NotFound}};
  for (const auto& [failure, status] : failures) {
    next_failure = failure;
    choose("b.jpg");
    apply();
    run_timers(50);
    assert(background_photo::status() == status);
  }
  next_failure = ImageDecodeFailure::TooLarge;
  apply();
  run_timers(50);
  assert(background_photo::unusable_reason() == Reason::TooLarge && !strcmp(background_photo::status_text(s), "too large"));
  next_failure = ImageDecodeFailure::NoMemory;
  apply();
  run_timers(50);
  assert(!strcmp(background_photo::status_text(s), "no memory"));
  next_failure = ImageDecodeFailure::None;
  assert(live.empty() && children() == 1 && !backdrop_shown && reloads == 6);

  // Shown, then None: the photo and its buffer go, the tiles reload once.
  apply();
  run_timers(50);
  assert(background_photo::status() == Status::Shown && live.size() == 1 && reloads == 7);
  choose("");
  apply();
  assert(background_photo::status() == Status::None && !strcmp(background_photo::status_text(s), "hint"));
  assert(live.empty() && children() == 1 && !backdrop_shown && reloads == 8);
  apply();
  assert(reloads == 8 && "None again changes nothing");
  background_photo::begin();
  run_timers(1500);
  assert(card_probes == 1 && "no card probe at boot without a photo");

  // The shown file vanishes (card swapped on a PC): gone at the next apply.
  choose("b.jpg");
  apply();
  run_timers(50);
  assert(background_photo::status() == Status::Shown && reloads == 9);
  remove_file("b.jpg");
  choose("b.jpg", 60, 30);
  apply();
  assert(background_photo::status() == Status::NotFound && live.empty() && children() == 1 && reloads == 10);

  lv_deinit();
  puts("background runtime: PASS");
  return 0;
}
`;
const source = path.join(out, 'test.cpp');
const binary = path.join(out, process.platform === 'win32' ? 'test.exe' : 'test');
fs.writeFileSync(source, cpp);
let r = spawnSync(host.cxx, ['-I', out, ...host.flags, '-std=c++17', source,
  path.join(root, 'src/ui/background/background_photo.cpp'), host.archive, '-o', binary], {encoding: 'utf8'});
assert.equal(r.status, 0, r.stdout + r.stderr);
r = spawnSync(binary, [], {encoding: 'utf8'});
assert.equal(r.status, 0, r.stdout + r.stderr);
console.log('Background runtime: list, boot, apply paths, statuses, buffers freed once, tile reloads');
