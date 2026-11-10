  // The Camera tile's picture (src/types/camera/picture.h), kept in fields
  // the tile does not use otherwise: sensor_display_mode 1 = the picture,
  // sensor_decimals its placement (0 fill, 1 fit, 2 original), image_slideshow_sec
  // a camera's interval, key_code the transparency of the circle and the
  // title pill, key_modifier bit 0 a tap opens the full screen, bit 1 the
  // light and bit 2 the dark head (neither: the design's). The form sends camera_display, camera_fit,
  // camera_every, camera_transparency, camera_head and camera_tap
  // (web_handler.cpp).
  const CAMERA_FITS = ['fill', 'fit', 'original'];
  const CAMERA_TAP_FULL = 1;
  const CAMERA_HEAD_LIGHT = 2;
  const CAMERA_HEAD_DARK = 4;

  function cameraEvery(value) {
    const seconds = Math.round(Number(value));
    return seconds >= 3 && seconds <= 60 ? seconds : 10;
  }

  function cameraTransparency(value) {
    const percent = Math.round(Number(value));
    return Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  }

  // The picture options of stored tile data (GET /api/tiles, drafts, imports).
  function cameraPictureOptionsOf(tile) {
    // A copied tile and a draft carry the editor's field names
    // (saveCameraFields); a stored tile its packed fields.
    if (tile && tile.camera_display !== undefined) {
      return {
        picture: String(tile.camera_display) === '1',
        fit: CAMERA_FITS.includes(tile.camera_fit) ? tile.camera_fit : 'fill',
        every: cameraEvery(tile.camera_every),
        transparency: cameraTransparency(tile.camera_transparency),
        head: ['dark', 'light'].includes(tile.camera_head) ? tile.camera_head : 'auto',
        tap: String(tile.camera_tap) === '1' ? '1' : '0'
      };
    }
    const flags = Number(tile?.key_modifier) || 0;
    return {
      picture: Number(tile?.sensor_display_mode) === 1,
      fit: CAMERA_FITS[Number(tile?.sensor_decimals)] || 'fill',
      every: cameraEvery(tile?.image_slideshow_sec),
      transparency: cameraTransparency(tile?.key_code),
      head: (flags & CAMERA_HEAD_LIGHT) ? 'light' : (flags & CAMERA_HEAD_DARK) ? 'dark' : 'auto',
      tap: (flags & CAMERA_TAP_FULL) ? '1' : '0'
    };
  }

  // key_modifier of the options (picture.h kTapFullScreen, kHeadLight, kHeadDark).
  function cameraOptionFlags(options) {
    return (options?.tap === '1' ? CAMERA_TAP_FULL : 0) |
      (options?.head === 'light' ? CAMERA_HEAD_LIGHT : options?.head === 'dark' ? CAMERA_HEAD_DARK : 0);
  }

  // The picture options in the editor's fields.
  function cameraPictureOptions(tab) {
    const value = field => document.getElementById(tab + '_' + field)?.value;
    const fit = value('camera_fit');
    return {
      picture: value('camera_display') === '1',
      fit: CAMERA_FITS.includes(fit) ? fit : 'fill',
      every: cameraEvery(value('camera_every')),
      transparency: cameraTransparency(value('camera_transparency')),
      head: ['dark', 'light'].includes(value('camera_head')) ? value('camera_head') : 'auto',
      tap: value('camera_tap') === '1' ? '1' : '0'
    };
  }

  // The rows of a picture show only with "Picture"; the interval and what a
  // tap opens only for a camera (an image entity sends each new picture at
  // once and has no popup).
  function syncCameraFields(tab) {
    const options = cameraPictureOptions(tab);
    const entity = document.getElementById(tab + '_camera_entity')?.value || '';
    document.getElementById(tab + '_camera_picture_fields')?.classList.toggle('hidden', !options.picture);
    document.getElementById(tab + '_camera_every_row')?.classList.toggle('hidden', !entity.startsWith('camera.'));
    document.getElementById(tab + '_camera_tap_row')?.classList.toggle('hidden', entity.startsWith('image.'));
    const output = document.getElementById(tab + '_camera_transparency_value');
    if (output) output.textContent = options.transparency + ' %';
    if (typeof syncSwitchChoices === 'function') syncSwitchChoices(tab);
  }

  function loadCameraFields(tab, data) {
    loadIconColorFields(tab, data);
    const el = document.getElementById(tab + '_camera_entity');
    const configured = data.sensor_entity || data.camera_entity || '';
    if (el) {
      el.value = configured;
    }
    const options = cameraPictureOptionsOf(data);
    const set = (field, value) => {
      const input = document.getElementById(tab + '_' + field);
      if (input) input.value = String(value);
    };
    set('camera_display', options.picture ? '1' : '0');
    set('camera_fit', options.fit);
    set('camera_every', options.every);
    set('camera_transparency', options.transparency);
    set('camera_head', options.head);
    set('camera_tap', options.tap);
    syncCameraFields(tab);
    maybeFillTitleFromEntity(tab, '_camera_entity');
  }
  function saveCameraFields(tab, formData) {
    const entity =
      document.getElementById(tab + '_camera_entity')?.value || '';
    formData.append('camera_entity', entity);
    formData.append('sensor_entity', entity);
    const options = cameraPictureOptions(tab);
    formData.append('camera_display', options.picture ? '1' : '0');
    formData.append('camera_fit', options.fit);
    formData.append('camera_every', String(options.every));
    formData.append('camera_transparency', String(options.transparency));
    formData.append('camera_head', options.head);
    formData.append('camera_tap', options.tap);
    saveIconColorFields(tab, formData);
  }
  function resetCameraFields(tab) {
    resetIconColorFields(tab);
    const el = document.getElementById(tab + '_camera_entity');
    if (el) el.value = '';
    const set = (field, value) => {
      const input = document.getElementById(tab + '_' + field);
      if (input) input.value = value;
    };
    set('camera_display', '0');
    set('camera_fit', 'fill');
    set('camera_every', '10');
    set('camera_transparency', '0');
    set('camera_head', 'auto');
    set('camera_tap', '0');
    syncCameraFields(tab);
  }

  // The head over the picture (camera_picture_layout::head): the circle in
  // the corner, the title on a pill mirrored into the other corner, or one
  // shared pill when less than a grid gap would stay free between them or the
  // title does not fit its pill.
  function cameraPictureHead(cardW, inset, disc, shrink, pad, gap, text) {
    text = Math.max(0, text);
    const boxW = text + 2 * (pad + shrink);
    const pillX = cardW - inset - boxW;
    const circleRight = inset + disc - shrink;
    if (pillX + shrink - circleRight >= gap) {
      return {shared: false, pillX, pillW: boxW, textX: pillX + shrink + pad, textW: text};
    }
    const textX = inset + disc;
    return {shared: true, pillX: inset, pillW: cardW - 2 * inset, textX,
            textW: Math.max(0, cardW - inset - shrink - pad - textX)};
  }

  let cameraMeasureContext = null;
  function cameraTextWidth(element, text) {
    if (!cameraMeasureContext && typeof document.createElement === 'function') {
      cameraMeasureContext = document.createElement('canvas').getContext?.('2d') || null;
    }
    if (!cameraMeasureContext || typeof getComputedStyle !== 'function') return 0;
    cameraMeasureContext.font = getComputedStyle(element).font;
    return cameraMeasureContext.measureText(text).width;
  }

  // The head rule's title width in display pixels (camera_picture_layout::
  // title_metric): the panel's whole-pixel advances of its title font
  // (CAMERA_TILE_LAYOUT.adv), so panel and preview choose the same head. A
  // character outside that table is measured in the browser and scaled.
  function cameraTitleMetric(layout, text, element, scale) {
    let width = 0;
    for (const char of String(text)) {
      const advance = layout?.adv?.[char.codePointAt(0) - layout.first];
      width += advance ? advance : (element ? cameraTextWidth(element, char) / (scale || 1) : 0);
    }
    return width;
  }

  // tile_geometry::extent in display pixels.
  function cameraExtent(position, span, cell, gap) {
    const edge = value => Math.round(value * (cell + gap));
    return edge(position + span) - edge(position) - gap;
  }

  // picture.h head_over_picture: the head over the picture follows the
  // design ('auto') or draws dark or light in either design ('' without a
  // picture); its card takes that design's tile color, never an own color
  // (cameraHeadBackground).
  function cameraHeadSurface(options, halfHeight) {
    if (!options?.picture || halfHeight) return '';
    return ['dark', 'light'].includes(options.head) ? options.head : 'auto';
  }
  function cameraHeadBackground(surface) {
    return surface === 'light' ? 'var(--pvl-card)' : surface === 'dark' ? 'var(--tile-default-bg)' : 'var(--tile-card)';
  }

  // The preview of a Camera tile showing its picture (live and cached grid):
  // the browser has no picture, so a neutral stand-in fills the card; the
  // head sits like on the panel, chosen in display pixels from the tile's
  // column and span (`place`). Half-height tiles keep the icon look.
  function applyCameraPicturePreview(tileElem, options, halfHeight, place) {
    if (!tileElem) return;
    const on = !!options?.picture && !halfHeight;
    tileElem.classList.toggle('camera-picture', on);
    tileElem.classList.remove('camera-head-shared');
    if (!on) return;
    tileElem.style.setProperty('--camera-head-opa', String((100 - cameraTransparency(options.transparency)) / 100));
    const title = tileElem.querySelector(':scope > .tile-title');
    if (!title || typeof getComputedStyle !== 'function') return;
    // One line, like the panel (hometiles_title single_line).
    const lines = title.querySelectorAll ? [...title.querySelectorAll('.tile-title-line')] : [];
    const text = lines.length ? lines.map(line => line.textContent).join(' ') : String(title.textContent || '');
    title.textContent = text;
    const layout = typeof CAMERA_TILE_LAYOUT === 'object' ? CAMERA_TILE_LAYOUT : null;
    if (!layout) return;
    const scale = parseFloat(getComputedStyle(tileElem).getPropertyValue('--radius-preview-scale')) || 0;
    const cardW = cameraExtent(Number(place?.col) || 0, Math.max(1, Number(place?.span_w) || 1),
                               layout.cellW, layout.gap);
    const head = cameraPictureHead(cardW, layout.inset, layout.disc, layout.shrink, layout.pad, layout.gap,
                                   cameraTitleMetric(layout, text, title, scale));
    tileElem.classList.toggle('camera-head-shared', head.shared);
  }
