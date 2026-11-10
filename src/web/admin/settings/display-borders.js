
  let normalTileBordersSaveSequence = 0;
  function applyNormalTileBordersPreview(enabled) {
    document.querySelectorAll('.normal-tile-border-toggle').forEach(input => {
      input.checked = !!enabled;
    });
    document.querySelectorAll('.tile-grid:not(.screensaver-tile-grid)').forEach(grid => {
      grid.classList.toggle('tiles-bordered', !!enabled);
    });
  }
  async function saveNormalTileBorders(enabled) {
    const wanted = !!enabled;
    const previous = !wanted;
    const sequence = ++normalTileBordersSaveSequence;
    applyNormalTileBordersPreview(wanted);
    try {
      const response = await fetch('api/display/tile-borders', {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: 'enabled=' + (wanted ? '1' : '0')
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
    } catch (error) {
      if (sequence !== normalTileBordersSaveSequence) return;
      applyNormalTileBordersPreview(previous);
      showNotification(t('networkErrorSave'), false);
    }
  }

// Icon discs are a root class: every preview grid, including cached and lazily
// inserted folders, follows it without re-rendering a tile.
let iconDiscsSaveSequence = 0;
function iconDiscsEnabled() {
  return !document.documentElement.classList.contains('icon-discs-off');
}
function applyIconDiscsPreview(enabled) {
  document.documentElement.classList.toggle('icon-discs-off', !enabled);
  document.querySelectorAll('.global-icon-disc-toggle').forEach(input => {
    input.checked = !!enabled;
  });
}
async function saveIconDiscs(enabled) {
  const wanted = !!enabled;
  const sequence = ++iconDiscsSaveSequence;
  applyIconDiscsPreview(wanted);
  try {
    const response = await fetch('api/display/icon-discs', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'enabled=' + (wanted ? '1' : '0')
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
  } catch (error) {
    if (sequence !== iconDiscsSaveSequence) return;
    applyIconDiscsPreview(!wanted);
    showNotification(t('networkErrorSave'), false);
  }
}

// Glow strength of colored icon discs: previews read the root variable
// --icon-glow-pct (applyIconDiscTint); the device rebuilds its tiles after
// the save. Range and step mirror icon_glow.h.
let iconGlowConfirmed = null;
let iconGlowSaveSequence = 0;
function currentIconGlow() {
  const raw = String(getComputedStyle(document.documentElement).getPropertyValue('--icon-glow-pct')).trim();
  const value = Number(raw);
  return raw !== '' && Number.isFinite(value) ? value : 25;
}
function previewIconGlowLive(value) {
  const number = Math.round(Number(value) / 5) * 5;
  const percent = Math.min(100, Math.max(0, Number.isFinite(number) ? number : 25));
  if (iconGlowConfirmed === null) iconGlowConfirmed = currentIconGlow();
  document.documentElement.style.setProperty('--icon-glow-pct', String(percent));
  document.querySelectorAll('.global-icon-glow').forEach(input => { input.value = String(percent); });
  document.querySelectorAll('.global-icon-glow-value').forEach(output => { output.textContent = percent + ' %'; });
  document.querySelectorAll('.tile').forEach(tile => applyIconDiscTint(tile));
  return percent;
}
async function saveIconGlow(value) {
  const percent = previewIconGlowLive(value);
  const sequence = ++iconGlowSaveSequence;
  try {
    const response = await fetch('api/display/icon-glow', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'percent=' + percent
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    if (sequence === iconGlowSaveSequence) iconGlowConfirmed = percent;
  } catch (error) {
    if (sequence !== iconGlowSaveSequence) return;
    const confirmed = iconGlowConfirmed;
    iconGlowConfirmed = null;
    if (confirmed !== null) previewIconGlowLive(confirmed);
    showNotification(t('networkErrorSave'), false);
  }
}

// The global default tile color paints every tile without its own color
// through --tile-default-bg; reset and new tiles take it as their default.
let defaultTileColorConfirmed = null;
let defaultTileColorSaveSequence = 0;
function currentDefaultTileColor() {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue('--tile-default-bg').trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : '#2A2A2A';
}
function previewDefaultTileColor(value) {
  const color = String(value || '').trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(color)) return;
  if (defaultTileColorConfirmed === null) {
    defaultTileColorConfirmed = currentDefaultTileColor();
  }
  document.documentElement.style.setProperty('--tile-default-bg', color);
  Object.values(typeof TILE_TYPE_REGISTRY === 'object' ? TILE_TYPE_REGISTRY : {})
    .forEach(meta => { if (meta && meta.sharedBg) meta.defaultBg = color; });
  document.querySelectorAll('.global-tile-color').forEach(input => { input.value = color; });
  // Open editors of tiles without their own color show the new default.
  document.querySelectorAll('input[type="color"][id$="_tile_color"]').forEach(input => {
    if (input.dataset.bgColorDefault !== '1') return;
    const tab = input.id.slice(0, -'_tile_color'.length);
    const type = document.getElementById(tab + '_tile_type')?.value || '0';
    if (getTileTypeMeta(type).sharedBg) input.value = color;
  });
  return color;
}
async function saveDefaultTileColor(value) {
  const color = previewDefaultTileColor(value);
  if (!color) return;
  const sequence = ++defaultTileColorSaveSequence;
  try {
    const response = await fetch('api/display/tile-color', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({color}).toString()
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const result = await response.json();
    if (!result.success || String(result.color).toUpperCase() !== color) {
      throw new Error('invalid response');
    }
    if (sequence === defaultTileColorSaveSequence) defaultTileColorConfirmed = color;
  } catch (error) {
    if (sequence !== defaultTileColorSaveSequence) return;
    previewDefaultTileColor(defaultTileColorConfirmed || color);
    showNotification(t('networkErrorSave'), false);
  }
}
function syncGlobalDisplayControls(tabEl) {
  tabEl.querySelectorAll('.global-icon-disc-toggle').forEach(input => {
    input.checked = iconDiscsEnabled();
  });
  const color = currentDefaultTileColor();
  tabEl.querySelectorAll('.global-tile-color').forEach(input => { input.value = color; });
  const glow = currentIconGlow();
  tabEl.querySelectorAll('.global-icon-glow').forEach(input => { input.value = String(glow); });
  tabEl.querySelectorAll('.global-icon-glow-value').forEach(output => { output.textContent = glow + ' %'; });
  renderBackgroundSettings(tabEl);
}

// Background photo from the panel's microSD /images folder, as Settings ›
// Display › Background on the panel. Replies carry the translated texts; each
// tab's copy of the controls shows the newest one. Only the newest request
// may render, so a slow reply never undoes a later change.
let backgroundSettings = null;
let backgroundRequest = 0;
let backgroundReloadTimer = null;
function renderBackgroundSettings(root = document) {
  const state = backgroundSettings;
  if (!state) return;
  const files = Array.isArray(state.files) ? state.files : [];
  root.querySelectorAll('.global-background-photo').forEach(select => {
    select.replaceChildren(new Option(state.none_label, ''));
    files.forEach(file => {
      const option = new Option(file.usable ? file.name : file.name + ' — ' + file.reason, file.name);
      option.disabled = !file.usable;
      select.add(option);
    });
    // A saved photo the card does not list stays selected; the status says why.
    if (state.photo && !files.some(file => file.name === state.photo)) {
      select.add(new Option(state.photo, state.photo));
    }
    select.value = state.photo;
  });
  [['.global-tile-opacity', state.opacity], ['.global-background-dim', state.dim]].forEach(([selector, value]) => {
    root.querySelectorAll(selector).forEach(input => {
      if (selector === '.global-tile-opacity') input.min = String(state.opacity_min);
      input.value = String(value);
      input.disabled = !state.photo;
    });
    root.querySelectorAll(selector + '-value').forEach(output => { output.textContent = value + ' %'; });
  });
  root.querySelectorAll('.global-background-status').forEach(span => { span.textContent = state.status_text; });
}
function previewBackgroundValue(input) {
  const output = input.parentElement && input.parentElement.querySelector('output');
  if (output) output.textContent = input.value + ' %';
}
// The panel decodes a new photo after the reply: fetch the status again until
// it is final.
function scheduleBackgroundReload() {
  backgroundReloadTimer = setTimeout(loadBackgroundSettings, 2000);
}
function startBackgroundRequest() {
  clearTimeout(backgroundReloadTimer);
  backgroundReloadTimer = null;
  return ++backgroundRequest;
}
async function loadBackgroundSettings() {
  const request = startBackgroundRequest();
  try {
    const response = await fetch('api/display/background');
    const result = await response.json();
    if (request !== backgroundRequest || !response.ok || !result.success) return;
    backgroundSettings = result;
    renderBackgroundSettings();
    if (result.status === 'loading') scheduleBackgroundReload();
  } catch (error) {}
}
async function saveBackgroundSettings(patch) {
  const request = startBackgroundRequest();
  try {
    const response = await fetch('api/display/background', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams(patch).toString()
    });
    const result = await response.json();
    if (request !== backgroundRequest) return;
    if (!response.ok || !result.success) {
      renderBackgroundSettings();
      if (response.status === 400 && result.error) {
        // A refused photo: the select is back on the saved one, the reason shows.
        document.querySelectorAll('.global-background-status').forEach(span => { span.textContent = result.error; });
      } else {
        showNotification(t('networkErrorSave'), false);
      }
      return;
    }
    backgroundSettings = result;
    renderBackgroundSettings();
    scheduleBackgroundReload();
  } catch (error) {
    if (request !== backgroundRequest) return;
    renderBackgroundSettings();
    showNotification(t('networkErrorSave'), false);
  }
}

// The shared root variables also reach cached and lazily inserted folder grids.
let tileRadiusConfirmed = null;
let tileRadiusWanted = null;
let tileRadiusSaving = false;
let tileRadiusRevision = 0;
let tileRadiusPreviewTimer = null;
let tileRadiusLiveWanted = null;
function previewTileRadiusLive(value) {
  const radius = previewTileRadius(value);
  tileRadiusLiveWanted = radius;
  if (tileRadiusPreviewTimer === null) tileRadiusPreviewTimer = setTimeout(() => {
    tileRadiusPreviewTimer = null;
    queueTileRadius(tileRadiusLiveWanted, false);
  }, 80);
}
function previewTileRadius(value) {
  const input = document.querySelector('.global-tile-radius');
  if (!input) return;
  const radius = Math.max(Number(input.min), Math.min(Number(input.max), Math.round(Number(value))));
  if (!Number.isFinite(radius)) return;
  const root = document.documentElement;
  if (tileRadiusConfirmed === null) {
    tileRadiusConfirmed = Number(getComputedStyle(root).getPropertyValue('--tile-radius-device'));
  }
  const scale = Number(getComputedStyle(root).getPropertyValue('--radius-preview-scale'));
  root.style.setProperty('--tile-radius', Math.max(1, Math.round(radius * scale)) + 'px');
  root.style.setProperty('--tile-radius-device', String(radius));
  document.querySelectorAll('.global-tile-radius').forEach(control => { control.value = radius; });
  document.querySelectorAll('.global-tile-radius-value').forEach(output => { output.textContent = radius; });
  tileRadiusRevision++;
  return radius;
}
function saveTileRadius(value) {
  clearTimeout(tileRadiusPreviewTimer);
  tileRadiusPreviewTimer = null;
  return queueTileRadius(value, true);
}
async function queueTileRadius(value, persist) {
  const radius = previewTileRadius(value);
  if (radius === undefined) return;
  tileRadiusWanted = { radius, persist };
  if (tileRadiusSaving) return;
  tileRadiusSaving = true;
  try {
    while (tileRadiusWanted !== null) {
      const wanted = tileRadiusWanted;
      const revision = tileRadiusRevision;
      tileRadiusWanted = null;
      try {
        const response = await fetch('api/display/tile-radius', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ radius: String(wanted.radius), preview: wanted.persist ? '0' : '1' }).toString()
        });
        if (!response.ok) throw new Error('save failed');
        const result = await response.json();
        if (!result.success || result.radius !== wanted.radius) throw new Error('invalid response');
        if (wanted.persist) tileRadiusConfirmed = wanted.radius;
      } catch (error) {
        if (tileRadiusWanted === null && revision === tileRadiusRevision) {
          previewTileRadius(tileRadiusConfirmed);
          showNotification(t('networkErrorSave'), false);
        }
      }
    }
  } finally { tileRadiusSaving = false; }
}
function syncTileRadiusControls(tabEl) {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--tile-radius-device').trim();
  tabEl.querySelectorAll('.global-tile-radius').forEach(control => { control.value = value; });
  tabEl.querySelectorAll('.global-tile-radius-value').forEach(output => { output.textContent = value; });
}
