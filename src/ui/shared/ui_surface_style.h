#pragma once

#include <lvgl.h>
#include "src/ui/shared/ui_theme.h"

namespace ui_surface_style {

// Baseline radii retain their inset from the fixed outer tile radius
// (tile_radius::kDefault; user 2026-10-11: no global radius setting).
int radius(int baseline);
void apply_radius(lv_obj_t* obj, int baseline, lv_style_selector_t selector = 0);

void disable_tile_border(lv_obj_t* obj);
void apply_tile_border(lv_obj_t* obj, bool enabled);
void apply_global_tile_border(lv_obj_t* obj);

// Tile icon discs. Every disc and control carries its own color
// (tone_color::fill) and one shared opacity: opaque, or the veil of the
// fixed Circle strength (icon_glow::kDefault) on see-through cards (user
// 2026-10-11: no circle settings).
uint8_t icon_glow_percent();
// Discs in Global mode are always shown (no global disc option any more).
bool icon_discs_shown();
// Draws a tile card's frame line again after its card color changed (a tint,
// a change of surface): the line follows the card (frame_line).
void refresh_tile_border(lv_obj_t* obj);
// The card's frame line over its children (a Camera tile's picture): a
// 1 px border drawn after them; the tile border options keep working.
void draw_frame_over_children(lv_obj_t* obj);
// A tile's frame line for its card color (frame_line: the plain card's fixed
// neutral, any other card a little darker or lighter).
lv_color_t frame_line_for(uint32_t card);
// The popup card hairline: follows the global Tile borders option, drawn like
// the tile border.
void apply_popup_border(lv_obj_t* obj, lv_color_t color, lv_opa_t opa);
// Gives a disc the shared opacity of its mode (tone_color::disc_opa: opaque,
// a veil on a `see_through` card), transparent for Off discs.
void apply_icon_disc(lv_obj_t* obj, bool off, bool follows_global, bool see_through = false);
// Gives a tile control the control fill for `selector` (pressed for buttons,
// the main part for surfaces): `color` (tone_color::Fill::control_color) at
// the shared control opacity (tone_color::control_opa). Local opacities of
// the owner still win.
void apply_control_fill(lv_obj_t* obj, lv_color_t color, lv_style_selector_t selector, bool see_through = false);

// Safe to call from the Web handler: only sets a flag. Apply the actual
// LVGL update later during the safe UI service pass.
void request_global_tile_border_refresh();
void process_pending_updates();

}  // namespace ui_surface_style
