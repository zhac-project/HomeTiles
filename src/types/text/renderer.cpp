#include "src/ui/shared/ui_surface_style.h"
#include "src/types/text/renderer.h"
#include "src/types/text/text_options.h"
#include "src/tiles/config/tile_geometry.h"
#include "src/tiles/runtime/tile_renderer_shared.h"
#include "src/ui/shared/tone_color.h"
#include "src/tiles/runtime/tile_renderer_fonts.h"
#include "src/tiles/runtime/tile_icon_disc.h"
#include "src/tiles/icons/mdi_icons.h"
#include <Arduino.h>
#include "src/ui/shared/ui_theme.h"

lv_obj_t* render_text_tile(lv_obj_t* parent, int col, int row, const Tile& tile, uint8_t index) {
  (void)index;

  lv_obj_t* card = lv_button_create(parent);
  if (!card) {
    Serial.println("[TileRenderer] ERROR: Could not create text card");
    return nullptr;
  }

  uint32_t card_color = tileBgColorOrDefault(tile, tileDefaultBgColor());
  lv_obj_set_style_bg_color(card, lv_color_hex(card_color), LV_PART_MAIN | LV_STATE_DEFAULT);
lv_obj_set_style_bg_grad_color(card, lv_color_hex(card_color), LV_PART_MAIN | LV_STATE_DEFAULT);
lv_obj_set_style_bg_grad_dir(card, LV_GRAD_DIR_NONE, LV_PART_MAIN | LV_STATE_DEFAULT);

  uint32_t pressed_color = tone_color::pressed_card(card_color);
  lv_obj_set_style_bg_color(card, lv_color_hex(pressed_color), LV_PART_MAIN | LV_STATE_PRESSED);
lv_obj_set_style_bg_grad_color(card, lv_color_hex(pressed_color), LV_PART_MAIN | LV_STATE_PRESSED);
lv_obj_set_style_bg_grad_dir(card, LV_GRAD_DIR_NONE, LV_PART_MAIN | LV_STATE_PRESSED);

  lv_obj_set_style_bg_opa(card, LV_OPA_COVER, 0);
  ui_surface_style::apply_radius(card, tile_layout::scale_480(22), 0);
  lv_obj_set_style_border_width(card, 0, 0);
  lv_obj_set_style_shadow_width(card, 0, 0);
  // A half-height tile shows the text alone with less padding above and
  // below (tile_geometry::compact_text).
  const bool compact = tile_geometry::compact_text(tile.type, tile.span_w, tile.span_h);
  lv_obj_set_style_pad_hor(card, tile_layout::scale_480(18), 0);
  lv_obj_set_style_pad_ver(card, tile_layout::scale_480(compact ? text_tile::kCompactPadV480 : 16), 0);
  lv_obj_remove_flag(card, LV_OBJ_FLAG_SCROLLABLE);
  disable_pressed_button_animation(card);

  place_tile_card(card, col, row, tile);

  // Icon (optional)
  String iconChar;
  if (!compact && tile.icon_name.length() > 0 && FONT_MDI_ICONS != nullptr) {
    iconChar = getMdiChar(tile.icon_name);
  }
  const bool has_icon = iconChar.length() > 0;
  lv_obj_t* header_icon = nullptr;
  if (has_icon) {
    lv_obj_t* icon_lbl = lv_label_create(card);
    if (icon_lbl) {
      set_label_style(icon_lbl, lv_color_hex(ui_theme::icon()), FONT_MDI_ICONS);
      lv_label_set_text(icon_lbl, iconChar.c_str());
      lv_obj_align(icon_lbl, LV_ALIGN_TOP_RIGHT,
                   tile_layout::scale_480(4),
                   tile_layout::scale_480(-8));
      header_icon = icon_lbl;
    }
  }

  // Title (optional)
  if (!compact && tile.title.length() > 0) {
    lv_obj_t* title_lbl = lv_label_create(card);
    if (title_lbl) {
      set_label_style(title_lbl, lv_color_hex(ui_theme::text()),
                      tile_layout::header_title_font());
      lv_obj_set_width(title_lbl, LV_PCT(has_icon ? 70 : 100));
      hometiles_title::tile(title_lbl, tile.title.c_str(), true);
      lv_obj_align(title_lbl, LV_ALIGN_TOP_LEFT, 0,
                   tile_layout::scale_480(4));
    }
  }
  // After the title exists, so the disc can lift the whole header.
  if (header_icon) tile_icon_disc::add_round(card, header_icon);

  auto get_text_font = [&](const Tile& t) -> const lv_font_t* {
    switch (t.sensor_value_font) {
      case 1:
        return tile_layout::content_font_20();
      case 2:
        return tile_layout::content_font_24();
      case 3:
        return tile_layout::content_font_32();
      case 4:
        return tile_layout::content_font_40();
      default:
        return FONT_VALUE;
    }
  };

  String text = tile.scene_alias;
  if (!text.length()) text = tile.key_macro;

  if (text.length()) {
    lv_obj_t* text_lbl = lv_label_create(card);
    if (text_lbl) {
      set_label_style(text_lbl, lv_color_hex(ui_theme::text()), get_text_font(tile));
      lv_label_set_text(text_lbl, text.c_str());
      lv_label_set_long_mode(text_lbl, LV_LABEL_LONG_WRAP);
      lv_obj_set_width(text_lbl, lv_pct(100));
      // The alignment (text_options.h): the lines left, centered or right in
      // the card, the block at the top (below a title or icon), in the
      // middle or at the bottom.
      const text_tile::Options options = text_tile::unpack(tile.sensor_gauge_max);
      lv_obj_set_style_text_align(text_lbl,
                                  options.h == text_tile::H_LEFT    ? LV_TEXT_ALIGN_LEFT
                                  : options.h == text_tile::H_RIGHT ? LV_TEXT_ALIGN_RIGHT
                                                                    : LV_TEXT_ALIGN_CENTER,
                                  0);
      const bool header = !compact && (tile.title.length() || has_icon);
      if (options.v == text_tile::V_TOP) {
        lv_obj_align(text_lbl, LV_ALIGN_TOP_MID, 0,
                     header ? tile_icon_disc::row_height() - lv_obj_get_style_pad_top(card, LV_PART_MAIN) : 0);
      } else if (options.v == text_tile::V_BOTTOM) {
        lv_obj_align(text_lbl, LV_ALIGN_BOTTOM_MID, 0, 0);
      } else {
        lv_obj_align(text_lbl, LV_ALIGN_CENTER, 0, header ? tile_layout::scale(12) : 0);
      }
    }
  }

  return card;
}
