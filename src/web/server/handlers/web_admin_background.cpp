#include "src/web/server/web_admin.h"

#include <vector>

#include "src/core/config/config_manager.h"
#include "src/core/i18n/i18n.h"
#include "src/devices/device.h"
#include "src/ui/background/background_photo.h"
#include "src/web/server/handlers/web_admin_handler_utils.h"

// Settings › Display › Background for Web Admin. Texts are translated here in
// the configured language; the panel applies a change on its next UI pass, so
// nothing in this file touches the display.
namespace {

using background_rules::Reason;
using background_rules::Status;
using web_admin_handlers::appendJsonEscaped;
using web_admin_handlers::sendJsonError;

const char* status_key(Status status) {
  switch (status) {
    case Status::None: return "none";
    case Status::Loading: return "loading";
    case Status::Shown: return "shown";
    case Status::NoCard: return "no_card";
    case Status::NotFound: return "not_found";
    case Status::Unusable: return "unusable";
    case Status::NoMemory: return "no_memory";
  }
  return "none";
}

void send_background(WebServer& server) {
  const DeviceConfig& cfg = configManager.getConfig();
  const i18n::Strings& tr = i18n::strings(cfg.language);
  std::vector<background_photo::Entry> files;
  const bool sd_ready = background_photo::list(files);
  String json;
  json.reserve(320 + files.size() * 48);
  json += "{\"success\":true,\"sd_ready\":";
  json += sd_ready ? "true" : "false";
  json += ",\"photo\":\"";
  appendJsonEscaped(json, cfg.background_photo);
  json += "\",\"status\":\"";
  json += status_key(background_photo::status());
  json += "\",\"status_text\":\"";
  appendJsonEscaped(json, background_photo::status_text(tr));
  json += "\",\"opacity\":";
  json += String(background_photo::effective_tile_opacity());
  json += ",\"dim\":";
  json += String(background_rules::clamp_dim(cfg.background_dim));
  json += ",\"opacity_min\":";
  json += String(Device::kTileOpacityPercentMin);
  json += ",\"none_label\":\"";
  appendJsonEscaped(json, tr.background_none);
  json += "\",\"files\":[";
  for (size_t i = 0; i < files.size(); ++i) {
    if (i) json += ',';
    json += "{\"name\":\"";
    appendJsonEscaped(json, files[i].name);
    if (files[i].reason == Reason::Usable) {
      json += "\",\"usable\":true}";
    } else {
      json += "\",\"usable\":false,\"reason\":\"";
      appendJsonEscaped(json, background_photo::reason_text(files[i].reason, tr));
      json += "\"}";
    }
  }
  json += "]}";
  server.send(200, "application/json", json);
}

// Why a photo cannot be chosen, or nullptr when it can.
const char* photo_error(const char* photo, const i18n::Strings& tr) {
  bool exists = false;
  const Reason reason = background_photo::check(photo, &exists);
  if (reason == Reason::BadName) return background_photo::reason_text(reason, tr);
  if (!Device::sdReadyCached()) return tr.background_no_card;
  if (!exists) return tr.background_not_found;
  if (reason != Reason::Usable) return background_photo::reason_text(reason, tr);
  return nullptr;
}

}  // namespace

void WebAdminServer::handleGetBackground() {
  webAdminMarkActivity();
  send_background(server);
}

// Form fields photo, opacity and dim are optional; an absent field keeps its
// saved value. A refused photo leaves every setting untouched.
void WebAdminServer::handleSaveBackground() {
  webAdminMarkActivity();
  const DeviceConfig& cfg = configManager.getConfig();
  const String photo = server.hasArg("photo") ? server.arg("photo") : String(cfg.background_photo);
  if (server.hasArg("photo") && photo.length()) {
    const char* error = photo_error(photo.c_str(), i18n::strings(cfg.language));
    if (error) {
      sendJsonError(server, 400, error);
      return;
    }
  }
  const int opacity = server.hasArg("opacity") ? server.arg("opacity").toInt() : cfg.tile_opacity;
  const int dim = server.hasArg("dim") ? server.arg("dim").toInt() : cfg.background_dim;
  if (!configManager.saveBackground(photo.c_str(),
                                    background_rules::clamp_opacity(opacity, Device::kTileOpacityPercentMin),
                                    background_rules::clamp_dim(dim))) {
    sendJsonError(server, 500, "Could not save the background");
    return;
  }
  background_photo::request_apply();
  send_background(server);
}
