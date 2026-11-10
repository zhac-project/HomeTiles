#pragma once

#include <Arduino.h>
#include <vector>

#include "src/ui/background/background_rules.h"
#include "src/core/i18n/i18n.h"

// The background photo behind the tile grids: a JPEG from the microSD /images
// folder, chosen in DeviceConfig::background_photo. Decoded once per photo and
// dim into one screen-sized buffer. Settings are never written here.
namespace background_photo {

struct Entry {
  String name;
  background_rules::Reason reason;
};

// The /images JPEGs, sorted, at most background_rules::kMaxListed; false when
// there is no card.
bool list(std::vector<Entry>& out);
// Probes /images/<name>. *exists is false without a card or file; orientation
// receives the EXIF orientation (1-8) when requested.
background_rules::Reason check(const char* name, bool* exists, uint8_t* orientation = nullptr);
// Boot: probes the card once after 1.5 s, then applies the saved choice.
void begin();
// Applies the saved settings on the next UI pass. Safe from any thread.
void request_apply();
// UI thread (tiles_process_reload_requests).
void process_pending();
background_rules::Status status();
background_rules::Reason unusable_reason();
// The saved tile opacity, never below the board's floor.
uint8_t effective_tile_opacity();
// Settings status line and the photo list's second line; "" for Usable.
const char* status_text(const i18n::Strings& s);
const char* reason_text(background_rules::Reason reason, const i18n::Strings& s);

}  // namespace background_photo
