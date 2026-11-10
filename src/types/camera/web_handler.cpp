#include "src/types/camera/web_handler.h"

#include "src/types/camera/picture.h"

// The picture options (picture.h): camera_display 0 icon / 1 picture,
// camera_fit fill / fit / original, camera_every a camera's interval in
// seconds, camera_transparency of the circle and title pill in percent,
// camera_head auto / dark / light; camera_tap 0 popup / 1 full screen.
// Missing or invalid values fall back to the icon, fill, 10 s, opaque, auto
// and popup.
void apply_camera_fields_from_request(WebServer& server, Tile& tile) {
  tile.sensor_entity =
      server.hasArg("camera_entity") ? server.arg("camera_entity") : "";
  tile.sensor_unit = "";
  tile.scene_alias = "";
  tile.key_macro = "";
  tile.image_path = "";
  tile.sensor_value_font = 0;
  tile.sensor_gauge_min = 0;
  tile.sensor_gauge_max = 100;
  tile.key_modifier = static_cast<uint8_t>((server.arg("camera_tap") == "1" ? camera_picture::kTapFullScreen : 0) |
                                           (server.arg("camera_head") == "light"  ? camera_picture::kHeadLight
                                            : server.arg("camera_head") == "dark" ? camera_picture::kHeadDark
                                                                                   : 0));

  tile.sensor_display_mode =
      server.arg("camera_display").toInt() == camera_picture::kShowPicture ? camera_picture::kShowPicture
                                                                           : camera_picture::kShowIcon;
  const String placement = server.arg("camera_fit");
  tile.sensor_decimals = placement == "fit"        ? bridge_images::kContain
                         : placement == "original" ? bridge_images::kOriginal
                                                   : bridge_images::kFill;
  long every = server.hasArg("camera_every") ? server.arg("camera_every").toInt() : 0;
  if (every < bridge_images::kEveryMin || every > bridge_images::kEveryMax) every = bridge_images::kEveryDefault;
  tile.image_slideshow_sec = static_cast<uint16_t>(every);
  long transparency = server.arg("camera_transparency").toInt();
  if (transparency < 0) transparency = 0;
  if (transparency > camera_picture::kTransparencyMax) transparency = camera_picture::kTransparencyMax;
  tile.key_code = static_cast<uint8_t>(transparency);
}
