
// types/text/text_options.h: the alignment in sensor_gauge_max, bits 11-12
  // horizontal (0 centered, 1 left, 2 right), 13-14 vertical (0 middle,
  // 1 top, 2 bottom); the low bits keep 100 (a tile saved before).
  function textTileOptions(raw) {
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) return {h: 0, v: 0};
    const h = (num >> 11) & 3, v = (num >> 13) & 3;
    return {h: h <= 2 ? h : 0, v: v <= 2 ? v : 0};
  }
  function packTextTileOptions(h, v) {
    const x = Number(h), y = Number(v);
    return 100 | ((x === 1 || x === 2 ? x : 0) << 11) | ((y === 1 || y === 2 ? y : 0) << 13);
  }
  // The preview's alignment classes (admin.css .text-h-* / .text-v-*).
  function applyTextPreviewAlign(tileElem, raw) {
    if (!tileElem?.classList) return;
    const options = textTileOptions(raw);
    tileElem.classList.toggle('text-h-left', options.h === 1);
    tileElem.classList.toggle('text-h-right', options.h === 2);
    tileElem.classList.toggle('text-v-top', options.v === 1);
    tileElem.classList.toggle('text-v-bottom', options.v === 2);
  }

  function normalizeTextValueFont(value) {
    const v = String(value || '0');
    return (['1','2','3','4'].includes(v)) ? v : '0';
  }

  function loadTextFields(tab, data) {
    loadIconColorFields(tab, data);
    const border = document.getElementById(tab + '_text_tile_border');
    if (border) border.checked = data?.tile_border !== undefined ? !['0','false'].includes(String(data.tile_border)) : Number(data?.sensor_display_mode) !== 1;
    const prefix = tab;
    const textEl = document.getElementById(prefix + '_text_value');
    const fontEl = document.getElementById(prefix + '_text_value_font');
    if (!textEl) return;
    if (data && data.text_value !== undefined) {
      textEl.value = data.text_value || '';
    } else if (data && data.scene_alias !== undefined) {
      textEl.value = data.scene_alias || '';
    } else if (data && data.key_macro !== undefined) {
      textEl.value = data.key_macro || '';
    } else {
      textEl.value = '';
    }
    const options = textTileOptions(data?.text_options !== undefined ? data.text_options
      : (data?.sensor_gauge_max !== undefined ? data.sensor_gauge_max : 100));
    const alignEl = document.getElementById(prefix + '_text_align');
    if (alignEl) alignEl.value = String(options.h);
    const valignEl = document.getElementById(prefix + '_text_valign');
    if (valignEl) valignEl.value = String(options.v);
    if (fontEl) {
      if (data && data.text_value_font !== undefined) {
        fontEl.value = normalizeTextValueFont(data.text_value_font);
      } else if (data && data.sensor_value_font !== undefined) {
        fontEl.value = normalizeTextValueFont(data.sensor_value_font);
      } else {
        fontEl.value = '0';
      }
    }
  }

  function saveTextFields(tab, formData) {
    saveIconColorFields(tab, formData);
    formData.append('tile_border', document.getElementById(tab + '_text_tile_border')?.checked === false ? '0' : '1');
    const prefix = tab;
    formData.append('text_value', document.getElementById(prefix + '_text_value')?.value || '');
    formData.append('text_value_font', document.getElementById(prefix + '_text_value_font')?.value || '0');
    formData.append('text_options', String(packTextTileOptions(document.getElementById(prefix + '_text_align')?.value || '0',
      document.getElementById(prefix + '_text_valign')?.value || '0')));
  }

  function resetTextFields(tab) {
    resetIconColorFields(tab);
    const border = document.getElementById(tab + '_text_tile_border');
    if (border) border.checked = true;
    const prefix = tab;
    const textEl = document.getElementById(prefix + '_text_value');
    if (textEl) textEl.value = '';
    const fontEl = document.getElementById(prefix + '_text_value_font');
    if (fontEl) fontEl.value = '0';
    for (const id of ['_text_align', '_text_valign']) {
      const el = document.getElementById(prefix + id);
      if (el) el.value = '0';
    }
  }
