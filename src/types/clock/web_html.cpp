#include "src/types/clock/web_html.h"

#include "src/core/config/config_manager.h"
#include "src/core/i18n/i18n.h"
#include "src/types/clock/clock_format.h"

void append_clock_date_format_options(String& html, const char* language) {
  const auto& tr = i18n::strings(language);
  html += R"html(<option value="0">)html";
  html += tr.format_auto_localization;
  html += R"html(</option><option value="1">DD.MM.YYYY</option><option value="2">MM/DD/YYYY</option>)html"
          R"html(<option value="3">YYYY/MM/DD</option><option value="4">DD/MM/YYYY</option>)html"
          R"html(<option value="5">DD.MM.</option><option value="6">)html";
  // The month formats as patterns like the others, in the panel's
  // language's order ("DD. MMMM", "DD MMMM YYYY"; issue #13).
  char pattern[32];
  clock_tile::format_date_pattern(pattern, sizeof(pattern), clock_tile::DATE_FORMAT_D_MONTH, language);
  html += pattern;
  html += R"html(</option><option value="7">)html";
  clock_tile::format_date_pattern(pattern, sizeof(pattern), clock_tile::DATE_FORMAT_D_MONTH_YEAR, language);
  html += pattern;
  html += "</option>";
}

void append_clock_fields_html(String& html, const String& tab_id) {
  const char* language = configManager.getConfig().language;
  const auto& tr = i18n::strings(language);
  html += R"html(
            <!-- Clock Fields -->
            <div id=")html";
  html += tab_id;
  html += R"html(_clock_fields" class="type-fields">
              <label>)html";
  html += tr.clock_style_label;
  html += R"html(</label>
              <select id=")html";
  html += tab_id;
  html += R"html(_clock_style">
                <option value="0">)html";
  html += tr.clock_style_digital;
  html += R"html(</option>
                <option value="1">)html";
  html += tr.clock_style_analog;
  html += R"html(</option>
                <option value="2">)html";
  html += tr.clock_style_wall;
  html += R"html(</option>
              </select>
              <div class="clock-wall-colors" id=")html";
  html += tab_id;
  html += R"html(_clock_wall_colors">
              <label>)html";
  html += tr.clock_dial_label;
  html += R"html(</label>
              <select id=")html";
  html += tab_id;
  html += R"html(_clock_dial">)html";
  {
    // clock_face::kDialColors order.
    const char* dials[] = {tr.clock_color_slate, tr.clock_color_black, tr.clock_color_white,
                           tr.clock_color_sage, tr.clock_color_navy, tr.clock_color_terracotta};
    for (int i = 0; i < 6; ++i) {
      html += "<option value=\"";
      html += String(i);
      html += "\">";
      html += dials[i];
      html += "</option>";
    }
  }
  html += R"html(</select>
              <label>)html";
  html += tr.clock_hands_label;
  html += R"html(</label>
              <select id=")html";
  html += tab_id;
  html += R"html(_clock_hands">)html";
  {
    // clock_face::kHandColors order.
    const char* hands[] = {tr.clock_color_gold, tr.clock_color_silver, tr.clock_color_black, tr.clock_color_white};
    for (int i = 0; i < 4; ++i) {
      html += "<option value=\"";
      html += String(i);
      html += "\">";
      html += hands[i];
      html += "</option>";
    }
  }
  html += R"html(</select>
              </div>
              <label class="inline-checkbox"><input type="checkbox" id=")html";
  html += tab_id;
  html += R"html(_clock_tile_border" checked>)html";
  html += tr.screensaver_tile_border;
  html += R"html(</label>
              <div class="clock-toggle-row">
              <label class="inline-checkbox">
                <input type="checkbox" id=")html";
  html += tab_id;
  html += R"html(_clock_show_time" checked>
                )html";
  html += tr.show_time;
  html += R"html(
              </label>
              <label class="inline-checkbox">
                <input type="checkbox" id=")html";
  html += tab_id;
  html += R"html(_clock_show_date">
                )html";
  html += tr.show_date;
  html += R"html(
              </label>
              <label class="inline-checkbox">
                <input type="checkbox" id=")html";
  html += tab_id;
  html += R"html(_clock_roll">
                )html";
  html += tr.clock_roll_digits;
  html += R"html(
              </label>
              </div>
              <label>)html";
  html += tr.time_font_size;
  html += R"html(</label>
              <select id=")html";
  html += tab_id;
  html += R"html(_clock_time_font">
                <option value="40">40 (Default)</option>
                <option value="20">20</option>
                <option value="24">24</option>
                <option value="28">28</option>
                <option value="32">32</option>
                <option value="48">48</option>
                <option value="56">56</option>
                <option value="64">64</option>
                <option value="72">72</option>
                <option value="80">80</option>
                <option value="96">96</option>
              </select>
              <label>)html";
  html += tr.date_font_size;
  html += R"html(</label>
              <select id=")html";
  html += tab_id;
  html += R"html(_clock_date_font">
                <option value="20">20 (Default)</option>
                <option value="24">24</option>
                <option value="28">28</option>
                <option value="32">32</option>
                <option value="40">40</option>
                <option value="48">48</option>
                <option value="56">56</option>
                <option value="64">64</option>
                <option value="72">72</option>
              </select>
              <label>)html";
  html += tr.time_format_label;
  html += R"html(</label>
              <select id=")html";
  html += tab_id;
  html += R"html(_clock_time_format">
                <option value="0">)html";
  html += tr.format_auto_localization;
  html += R"html(</option>
                <option value="1">)html";
  html += tr.format_24_hour;
  html += R"html(</option>
                <option value="2">)html";
  html += tr.format_12_hour;
  html += R"html(</option>
              </select>
              <label>)html";
  html += tr.date_format_label;
  html += R"html(</label>
              <select id=")html";
  html += tab_id;
  html += R"html(_clock_date_format">)html";
  append_clock_date_format_options(html, language);
  html += R"html(
              </select>
              <label>)html";
  html += tr.clock_weekday_label;
  html += R"html(</label>
              <select id=")html";
  html += tab_id;
  html += R"html(_clock_weekday">
                <option value="0">)html";
  html += tr.clock_weekday_none;
  html += R"html(</option>
                <option value="1">)html";
  // Saturday as the example, like the date (a Saturday too).
  html += tr.clock_weekday_short;
  html += " (";
  html += clock_tile::weekday_short_name(6, language);
  html += R"html()</option>
                <option value="2">)html";
  html += tr.clock_weekday_long;
  html += " (";
  html += clock_tile::weekday_name(6, language);
  html += R"html()</option>
              </select>
              <label>)html";
  html += tr.clock_alignment_label;
  html += R"html(</label>
              <select id=")html";
  html += tab_id;
  html += R"html(_clock_align">
                <option value="0">)html";
  html += tr.alignment_center;
  html += R"html(</option>
                <option value="1">)html";
  html += tr.alignment_left;
  html += R"html(</option>
                <option value="2">)html";
  html += tr.alignment_right;
  html += R"html(</option>
              </select>
            </div>
)html";
}

