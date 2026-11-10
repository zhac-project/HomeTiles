#include "src/types/text/web_html.h"
#include "src/core/config/config_manager.h"
#include "src/core/i18n/i18n.h"

void append_text_fields_html(String& html, const String& tab_id) {
  const auto& tr = i18n::strings(configManager.getConfig().language);
  html += R"html(
            <!-- Text Fields -->
            <div id=")html";
  html += tab_id;
  html += R"html(_text_fields" class="type-fields">
              <label class="inline-checkbox"><input type="checkbox" id=")html";
  html += tab_id;
  html += R"html(_text_tile_border" checked>)html";
  html += tr.screensaver_tile_border;
  html += R"html(</label>
              <label>)html";
  html += tr.text_label;
  html += R"html(</label>
              <textarea id=")html";
  html += tab_id;
  html += R"html(_text_value" rows="3" placeholder=")html";
  html += tr.text_placeholder;
  html += R"html("></textarea>
              <label>)html";
  html += tr.text_size;
  html += R"html(</label>
              <select id=")html";
  html += tab_id;
  html += R"html(_text_value_font">
                <option value="0">28 (Default)</option>
                <option value="1">20</option>
                <option value="2">24</option>
                <option value="3">32</option>
                <option value="4">40</option>
              </select>
              <div style="font-size:11px;color:#8a8a8a;margin-top:4px;">)html";
  html += tr.text_max_chars;
  html += R"html(</div>
              <label>)html";
  html += tr.text_align_horizontal;
  html += R"html(</label>
              <select id=")html";
  html += tab_id;
  html += R"html(_text_align">
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
              <label>)html";
  html += tr.text_align_vertical;
  html += R"html(</label>
              <select id=")html";
  html += tab_id;
  html += R"html(_text_valign">
                <option value="0">)html";
  html += tr.alignment_middle;
  html += R"html(</option>
                <option value="1">)html";
  html += tr.alignment_top;
  html += R"html(</option>
                <option value="2">)html";
  html += tr.alignment_bottom;
  html += R"html(</option>
              </select>
            </div>
)html";
}
