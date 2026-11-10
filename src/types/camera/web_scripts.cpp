#include "src/types/camera/web_scripts.h"

#include "src/tiles/config/tile_config.h"
#include "src/tiles/icons/mdi_icons.h"
#include "src/tiles/runtime/tile_icon_disc.h"
#include "src/tiles/runtime/tile_renderer_fonts.h"
#include "src/types/camera/picture.h"

// The editable JavaScript lives in src/web/assets/admin.js and is served as
// one precompressed, cacheable firmware asset. The preview of a Camera tile
// showing its picture chooses its head like the panel (picture.cpp
// show_head): the geometry in display pixels and the title font's
// whole-pixel advances from U+0020 to U+017F (0: not in the font; the preview
// measures such a title itself).
void append_camera_scripts(String& html) {
  const int icon_w =
      FONT_MDI_ICONS ? lv_font_get_glyph_width(FONT_MDI_ICONS, tile_icon_disc::kMdiReferenceGlyph, 0) : 0;
  char text[200];
  snprintf(text, sizeof(text),
           "  <script>\n  const CAMERA_TILE_LAYOUT = Object.freeze({cellW: %d, cellH: %d, gap: %d, inset: %d, "
           "disc: %d, shrink: %d, pad: %d, first: 32, adv: [",
           GRID_CELL_W, GRID_CELL_H, GRID_GAP, tile_icon_disc::inset(), tile_icon_disc::header_diameter(icon_w),
           tile_icon_disc::corner_shrink(), static_cast<int>(tile_layout::scale_480(camera_picture::kTitlePad)));
  html += text;
  const lv_font_t* font = tile_layout::header_title_font();
  for (uint32_t code = 0x20; code <= 0x17F; ++code) {
    if (code != 0x20) html += ',';
    html += String(font ? lv_font_get_glyph_width(font, code, 0) : 0);
  }
  html += "]});\n  </script>\n";
}
