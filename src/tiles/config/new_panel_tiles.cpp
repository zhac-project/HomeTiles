#include "src/tiles/config/new_panel_tiles.h"

#include <Arduino.h>

#include <memory>
#include <new>

#include "src/core/config/config_manager.h"
#include "src/core/i18n/i18n.h"
#include "src/tiles/config/grid_layout.h"
#include "src/tiles/config/tile_config.h"
#include "src/tiles/config/tile_layouts.h"
#include "src/types/clock/clock_format.h"
#include "src/types/text/text_options.h"
#include "src/web/server/handlers/web_admin_tile_helpers.h"

namespace new_panel_tiles {
namespace {

constexpr const char* kLightsIcon = "lightbulb-group";
// Home Assistant's climate and scene icons.
constexpr const char* kClimateIcon = "thermostat";
constexpr const char* kScenesIcon = "palette";
// "Scenes" brings a little color to the first page (user 2026-10-14): its
// icon in purple, the tile filled with it (tile_icon_colors.h record).
constexpr const char* kScenesColors = "v2\nAB47BC\nfill 20";
// The clock's own sizes (the face picks the sizes of its lines itself), for a
// change to the digital clock.
constexpr uint8_t kClockTimeSize = 40;
constexpr uint8_t kClockDateSize = 20;

bool overlaps(const Place& a, const Tile& tile) {
  return a.col < tile.col + tile.span_w && tile.col < a.col + a.span_w && a.row < tile.row + tile.span_h &&
         tile.row < a.row + a.span_h;
}

// Clock and Text: Transparent (tileTransparent, black own color) without a
// frame line.
void make_transparent(Tile& tile) {
  tile.bg_color = TILE_BG_COLOR_EXPLICIT;
  tile.sensor_display_mode = 1;
}

Tile clock_tile_default() {
  Tile tile;
  tile.type = TILE_CLOCK;
  // The analog face with the time and date (the clock flags) beside it: the
  // time in the panel's own format like the head bar (Auto: 24 h or 12 h by
  // the language), the short weekday and the day with its month, "15:28"
  // over "Mi., 14. Oktober" (user 2026-10-14: the full weekday and year ran
  // out of the 2x1 tile on the square and upright panels; Auto like the
  // head).
  tile.sensor_decimals = 3;
  tile.key_code = kClockTimeSize;
  tile.key_modifier = kClockDateSize;
  tile.sensor_gauge_min = clock_tile::TIME_FORMAT_AUTO;
  clock_tile::TileDateOptions options;
  options.style = clock_tile::STYLE_ANALOG;
  options.weekday = clock_tile::WEEKDAY_SHORT;
  options.date_format = clock_tile::DATE_FORMAT_D_MONTH;
  tile.sensor_gauge_max = clock_tile::pack_date_options(options);
  make_transparent(tile);
  return tile;
}

Tile folder_tile(uint16_t folder_id, const char* name, const char* icon) {
  Tile tile;
  tile.type = TILE_FOLDER;
  tile.title = name;
  tile.icon_name = icon;
  setNavigateTargetId(tile, folder_id);
  return tile;
}

Tile welcome_tile(const char* text) {
  Tile tile;
  tile.type = TILE_TEXT;
  tile.scene_alias = text;
  tile.sensor_gauge_max = text_tile::kBase;
  make_transparent(tile);
  return tile;
}

void place(Tile& tile, const Place& at) {
  tile.col = at.col;
  tile.row = at.row;
  tile.span_w = at.span_w;
  tile.span_h = at.span_h;
}

// Like the Web Admin's parking slot: the tile keeps its look and classic
// place for a restore, the swipe stays as the way to Settings.
bool park_settings_tile(const TileGridConfig& grid) {
  std::unique_ptr<DeviceConfig> cfg(new (std::nothrow) DeviceConfig(configManager.getConfig()));
  if (!cfg) return false;
  for (const Tile& tile : grid.tiles) {
    if (tile.type != TILE_SETTINGS) continue;
    TileConfig::snapshotSettingsTile(tile, cfg->settings_tile_snapshot);
    // No title of its own: the tile got its name before the setup's language
    // choice; restored, it takes the panel's language then.
    cfg->settings_tile_snapshot.title[0] = '\0';
  }
  cfg->settings_tile_hidden = true;
  // Parked in the head bar layouts, which have the gear; the classic one
  // shows the tile (user 2026-10-13: each layout decides).
  cfg->settings_parked = (1u << static_cast<uint8_t>(grid_layout::Layout::kBar)) |
                         (1u << static_cast<uint8_t>(grid_layout::Layout::kPortrait));
  cfg->settings_swipe_enabled = true;
  return configManager.save(*cfg) &&
         tileConfig.setSettingsTileVisible(false) == SettingsTileVisibilityResult::Success;
}

}  // namespace

bool seed() {
  using grid_layout::Layout;
  // The head bar layout of the panel's own orientation.
  const Layout layout = grid_layout::native_portrait() ? Layout::kPortrait : Layout::kBar;
  const grid_layout::Shown bar = grid_layout::layout_grid(layout);
  Place classic[kSlotCount];
  Place in_bar[kSlotCount];
  if (!grid_layout::switchable(layout) || !places(GRID_COLS, GRID_ROWS, classic) ||
      !places(bar.cols, bar.rows, in_bar)) {
    Serial.println("[NewPanel] No head bar layout here, the classic Home stays");
    return false;
  }
  std::unique_ptr<TileGridConfig> grid(new (std::nothrow) TileGridConfig{});
  if (!grid || !tileConfig.loadFolderGridClassic(TileConfig::rootFolderId(), *grid)) return false;
  // Only a Home nobody filled yet (its Settings tile alone), and only where
  // the new tiles keep clear of it.
  for (const Tile& tile : grid->tiles) {
    if (tile.type == TILE_EMPTY) continue;
    if (tile.type != TILE_SETTINGS) return false;
    for (const Place& at : classic) {
      if (overlaps(at, tile)) return false;
    }
  }
  const auto& tr = i18n::strings(configManager.getConfig().language);
  uint16_t lights = 0;
  uint16_t climate = 0;
  uint16_t scenes = 0;
  if (!tileConfig.createFolder(TileConfig::rootFolderId(), tr.new_panel_lights, kLightsIcon, lights) ||
      !tileConfig.createFolder(TileConfig::rootFolderId(), tr.new_panel_climate, kClimateIcon, climate) ||
      !tileConfig.createFolder(TileConfig::rootFolderId(), tr.new_panel_scenes, kScenesIcon, scenes)) {
    Serial.println("[NewPanel] Creating the folders failed");
    return false;
  }
  Tile tiles[kSlotCount] = {clock_tile_default(), folder_tile(scenes, tr.new_panel_scenes, kScenesIcon),
                            welcome_tile(tr.new_panel_welcome), folder_tile(lights, tr.new_panel_lights, kLightsIcon),
                            folder_tile(climate, tr.new_panel_climate, kClimateIcon)};
  tiles[kScenes].icon_colors = kScenesColors;
  size_t index[kSlotCount] = {};
  int slot = 0;
  for (size_t i = 0; i < TILES_PER_GRID && slot < kSlotCount; ++i) {
    if (grid->tiles[i].type != TILE_EMPTY) continue;
    place(tiles[slot], classic[slot]);
    grid->tiles[i] = tiles[slot];
    index[slot++] = i;
  }
  // The save gives the tiles their stable IDs, which key their head bar
  // places.
  if (slot != kSlotCount || !tileConfig.saveFolderGridClassic(TileConfig::rootFolderId(), *grid)) return false;
  // Places in both head bar layouts where the panel can show both, so the
  // setup's layout choice (landscape / upright) finds them; the pages need
  // none there.
  const Layout kBarLayouts[] = {Layout::kBar, Layout::kPortrait};
  for (const Layout each : kBarLayouts) {
    const grid_layout::Shown shown = grid_layout::layout_grid(each);
    Place at[kSlotCount];
    if (!grid_layout::switchable(each) || !places(shown.cols, shown.rows, at)) continue;
    for (int i = 0; i < kFirstPage; ++i) {
      const uint16_t view_id = grid->tiles[index[i]].view_id;
      if (!view_id) return false;
      tile_layouts::set(each, TileConfig::rootFolderId(), view_id, {at[i].col, at[i].row, at[i].span_w, at[i].span_h});
    }
  }
  // Lights and Climate are the head's pages (user 2026-10-14: swiping shows
  // them); the classic layout keeps them as folders.
  const uint16_t pages[] = {lights, climate};
  tile_layouts::set_pages(pages, sizeof(pages) / sizeof(pages[0]));
  // The gear in the head opens Settings.
  if (!tile_layouts::commit() || !configManager.saveHeadGear(true) ||
      !configManager.saveLayout(static_cast<uint8_t>(layout))) {
    Serial.println("[NewPanel] Storing the head bar layout failed");
    return false;
  }
  // The Settings tile starts parked (user 2026-10-12): without a place it sat
  // in the storage of the head bar layouts and in the classic grid.
  if (!park_settings_tile(*grid)) Serial.println("[NewPanel] Parking the Settings tile failed");
  grid_layout::apply(static_cast<uint8_t>(layout));
  tileConfig.load();
  Serial.printf("[NewPanel] First page ready in the %s layout\n", grid_layout::key(grid_layout::active()));
  return true;
}

void follow_language(const char* from, const char* to) {
  const auto& before = i18n::strings(from);
  const auto& after = i18n::strings(to);
  if (&before == &after) return;
  std::unique_ptr<TileGridConfig> grid(new (std::nothrow) TileGridConfig{});
  if (!grid || !tileConfig.loadFolderGridClassic(TileConfig::rootFolderId(), *grid)) return;
  bool changed = false;
  for (Tile& tile : grid->tiles) {
    if (tile.type == TILE_FOLDER) {
      const char* name = tile.title == before.new_panel_lights    ? after.new_panel_lights
                         : tile.title == before.new_panel_climate ? after.new_panel_climate
                         : tile.title == before.new_panel_scenes  ? after.new_panel_scenes
                                                                   : nullptr;
      if (!name) continue;
      const uint16_t folder_id = getNavigateTargetId(tile);
      const FolderEntry* entry = tileConfig.getFolder(folder_id);
      if (entry && tile.title == entry->name) tileConfig.updateFolder(folder_id, name, entry->icon_name);
      tile.title = name;
      changed = true;
    } else if (tile.type == TILE_TEXT && tile.scene_alias == before.new_panel_welcome) {
      tile.scene_alias = after.new_panel_welcome;
      changed = true;
    }
  }
  if (!changed || !tileConfig.saveFolderGridClassic(TileConfig::rootFolderId(), *grid)) return;
  // The shown Home reads them again (with its layout's places).
  if (tileConfig.getActiveFolderId() == TileConfig::rootFolderId()) tileConfig.setActiveFolder(TileConfig::rootFolderId());
  Serial.printf("[NewPanel] Default names follow the language %s\n", to);
}

}  // namespace new_panel_tiles
