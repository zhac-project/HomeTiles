
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

// The head bar's time and the pages' overview on its dots (Global tab
// "Kopfleiste", every grid page's copy kept in step), saved at once.
async function saveHeadSwitch(part, enabled) {
  const show = value => {
    document.querySelectorAll('.head-bar-' + part).forEach(box => { box.checked = value; });
    if (part === 'clock') {
      document.querySelectorAll('.head-bar-preview .head-time').forEach(time => time.classList.toggle('is-off', !value));
    }
  };
  show(!!enabled);
  try {
    const response = await fetch('api/display/head', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'part=' + encodeURIComponent(part) + '&enabled=' + (enabled ? '1' : '0')
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
  } catch (error) {
    show(!enabled);
    showNotification(t('networkErrorSave'), false);
  }
}

// The gear in Home's head with a bar layout (a Settings tile option): saved
// at once, the preview's head follows.
async function saveHeadGear(enabled) {
  const show = value => {
    document.querySelectorAll('.settings-head-gear').forEach(box => { box.checked = value; });
    document.querySelectorAll('.head-bar-preview .head-gear').forEach(gear => gear.classList.toggle('is-off', !value));
  };
  show(!!enabled);
  try {
    const response = await fetch('api/display/head-gear', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'enabled=' + (enabled ? '1' : '0')
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
  } catch (error) {
    show(!enabled);
    showNotification(t('networkErrorSave'), false);
  }
}

// Home's own title and icon in its head (the head bar tab, user 2026-10-13):
// Auto is "Home" in the panel's language and the house, stored empty. Every
// grid page's copy and Home's head previews follow; the title is saved after
// a short pause, an icon at once.
let homeHeadSaveTimer = 0;
function homeHeadState(tab) {
  const autoTitle = document.getElementById(tab + '_head_tile_title_auto')?.dataset.autoTitle || '';
  const typed = String(document.getElementById(tab + '_head_tile_title')?.value || '').replace(/\s+/g, ' ').trim();
  const title = typed === autoTitle ? '' : typed;
  const icon = normalizeMdiIconName(String(document.getElementById(tab + '_head_tile_icon')?.value || ''));
  return {title, icon, shownTitle: title || autoTitle, shownIcon: icon || 'home'};
}
function showHomeHead(state, tab) {
  document.querySelectorAll('textarea.home-head-title').forEach(field => {
    if (field.id !== tab + '_head_tile_title' && field.value !== state.shownTitle) field.value = state.shownTitle;
  });
  document.querySelectorAll('input.home-head-icon').forEach(field => {
    if (field.value !== state.icon) field.value = state.icon;
  });
  document.querySelectorAll('.head-bar-preview.home-head').forEach(head => {
    const title = head.querySelector('.head-title');
    if (title) title.textContent = state.shownTitle;
    const icon = head.querySelector('.head-disc > i');
    if (icon) icon.className = 'mdi mdi-' + state.shownIcon;
  });
}
async function saveHomeHead(state) {
  try {
    const response = await fetch('api/display/home-head', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'title=' + encodeURIComponent(state.title) + '&icon=' + encodeURIComponent(state.icon)
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
  } catch (error) {
    showNotification(t('networkErrorSave'), false);
  }
}
document.addEventListener('input', event => {
  const field = event.target;
  const title = field?.classList?.contains('home-head-title');
  if (!title && !field?.classList?.contains('home-head-icon')) return;
  // One line: a pasted line break becomes a space.
  if (title && field.value.includes('\n')) field.value = field.value.replace(/\s*\n\s*/g, ' ');
  const tab = field.id.replace(/_head_tile_(title|icon)$/, '');
  const state = homeHeadState(tab);
  showHomeHead(state, tab);
  clearTimeout(homeHeadSaveTimer);
  homeHeadSaveTimer = setTimeout(() => saveHomeHead(state), title ? 600 : 0);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target?.classList?.contains('home-head-title')) event.preventDefault();
});
// An emptied title shows Auto's name again when the field is left.
document.addEventListener('change', event => {
  const field = event.target;
  if (!field?.classList?.contains('home-head-title')) return;
  const shown = homeHeadState(field.id.replace(/_head_tile_title$/, '')).shownTitle;
  if (field.value !== shown) field.value = shown;
});

// A layout (grid_layout.h) is read at boot: the layout window restarts the
// panel after choosing one.
function restartPanelForLayout() {
  const restartForm = document.getElementById('admin_restart_form');
  // form.submit() cannot carry the CSRF header a password-protected panel
  // requires (hardware/editor.js restartHardwareIoNow).
  if (restartForm && !window.HomeTilesAuth?.csrfToken()) {
    window.setTimeout(() => restartForm.submit(), 100);
    return;
  }
  fetch('restart', {method: 'POST'}).catch(() => {}).finally(() => {
    window.setTimeout(() => window.location.assign('./'), 300);
  });
}
// The head bar preview's time (web_admin_html.cpp), from the browser clock
// in the panel's 12/24-hour format.
function refreshHeadBarTime() {
  const now = new Date();
  document.querySelectorAll('.head-bar-preview .head-time').forEach(el => {
    let hour = now.getHours();
    // The panel's format (PANEL_TIME_FORMAT follows a change, localization.js).
    const hour12 = typeof PANEL_TIME_FORMAT === 'number' ? PANEL_TIME_FORMAT === 2 : el.dataset.hour12 === '1';
    if (hour12) hour = hour % 12 || 12;
    const text = String(hour).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    // Fixed-width digits like the panel's head (tabular_digits).
    if (typeof setClockDigits === 'function') setClockDigits(el, text);
    else el.textContent = text;
  });
}
// The layout window shows the head with any layout.
if (typeof window !== 'undefined' && window.setInterval) {
  window.setInterval(refreshHeadBarTime, 30000);
}

// The fixed Circle strength (icon_glow::kDefault, user 2026-10-11: no circle
// settings): previews read the root variable --icon-glow-pct.
function currentIconGlow() {
  const raw = String(getComputedStyle(document.documentElement).getPropertyValue('--icon-glow-pct')).trim();
  const value = Number(raw);
  return raw !== '' && Number.isFinite(value) ? value : 25;
}
// The theme (ui_theme.h): the panel switches while running; every grid's
// field shows the saved choice.
let themeSaveSequence = 0;
let themeChosen = null;
let themeSaveBusy = 0;
// The preview follows the theme at once: the roles (--pv-*) switch with
// html[data-panel-theme], and what the script computes from them (circles,
// tints, readable icons, bars, the head circle) is computed again.
function applyPanelThemePreview(theme) {
  document.documentElement.dataset.panelTheme = theme === '1' ? 'light' : 'dark';
  const glow = currentIconGlow();
  const parse = hex => /^#[0-9a-f]{6}$/i.test(hex) ? [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) : null;
  const card = parse(panelVar('--tile-card', '')) || [26, 26, 26];
  // The neutral circle for tiles the script does not tint (web_admin_styles).
  const disc = toneFill(card, [255, 255, 255], false, glow, false);
  document.documentElement.style.setProperty('--icon-disc-bg',
    'rgba(' + disc.discColor.join(',') + ',' + (disc.discOpa / 255).toFixed(3) + ')');
  // The head's circle: the gear's circle over the screen (light) or the tile
  // color (dark), like home_bar.cpp.
  const headBase = panelLight() ? (panelRole('screen') || card) : card;
  document.documentElement.style.setProperty('--head-disc-color',
    toneHex(toneFill(headBase, [0x9E, 0x9E, 0x9E], false, glow, false).disc));
  tileDataLoadedTabs.forEach(tab => {
    getTilesData(tab).forEach((tile, index) => { if (tile) renderTileFromData(tab, index, tile, sensorMetaCache); });
  });
  // The parked Settings tile keeps its card color from its last render: draw
  // it again in the new theme (settings/access.js).
  const parked = document.getElementById('settingsHiddenTile');
  if (parked && typeof renderSettingsHiddenSlot === 'function') renderSettingsHiddenSlot(parked.dataset.hidden === '1');
  document.querySelectorAll('.tile').forEach(tile => applyIconDiscTint(tile));
  if (typeof currentTileTab === 'string' && currentTileTab) updateTilePreview(currentTileTab);
}
// Automatic ('2', theme_schedule.h) shows what the panel picked for the time
// of day: the answer's "effective" theme.
function shownPanelTheme() {
  return document.documentElement.dataset.panelTheme === 'light' ? '1' : '0';
}
// The design's segmented choice in every Global tab (web_admin_html.cpp).
function showThemeChoice(theme, scope = document) {
  scope.querySelectorAll('.global-theme [data-theme]').forEach(button => {
    const active = button.dataset.theme === theme;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}
async function saveTheme(value) {
  const theme = ['0', '1', '2'].includes(String(value)) ? String(value) : '0';
  const previous = themeChosen !== null ? themeChosen
    : (document.querySelector('.global-theme [data-theme].active')?.dataset.theme || shownPanelTheme());
  const previousShown = shownPanelTheme();
  themeChosen = theme;
  showThemeChoice(theme);
  if (theme !== '2') applyPanelThemePreview(theme);
  const sequence = ++themeSaveSequence;
  ++themeSaveBusy;
  try {
    const response = await fetch('api/display/theme', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'theme=' + theme
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const answer = await response.json().catch(() => null);
    if (sequence !== themeSaveSequence) return;
    const shown = String(answer?.effective ?? (theme === '2' ? previousShown : theme));
    if (shown !== shownPanelTheme()) applyPanelThemePreview(shown === '1' ? '1' : '0');
  } catch (error) {
    if (sequence !== themeSaveSequence) return;
    themeChosen = previous;
    showThemeChoice(previous);
    if (previousShown !== shownPanelTheme()) applyPanelThemePreview(previousShown);
    showNotification(t('networkErrorSave'), false);
  } finally {
    --themeSaveBusy;
  }
}
// A design chosen on the panel (Settings > Display, the setup) or Automatic
// turning at dusk (user 2026-10-14: the page kept the old one): the poll
// (localization.js) brings the stored choice and the shown look, the fields
// and the previews follow. Not while this page saves one itself.
function applyPanelThemeFromDevice(stored, shown) {
  const theme = String(stored);
  if (themeSaveBusy || !['0', '1', '2'].includes(theme)) return;
  if (document.querySelector('.global-theme [data-theme].active')?.dataset.theme !== theme) {
    themeChosen = theme;
    showThemeChoice(theme);
  }
  const look = String(shown) === '1' ? '1' : '0';
  if (look !== shownPanelTheme()) applyPanelThemePreview(look);
}
function syncGlobalDisplayControls(tabEl) {
  if (themeChosen !== null) showThemeChoice(themeChosen, tabEl);
  if (gestureActions) showGestureActions(gestureActions, tabEl);
  renderBackgroundSettings(tabEl);
}

// The gesture menu (swipe_gestures.h, user 2026-10-11): one action per edge
// (0 off, 1 Settings, 2 Home, 3 Back, 4 screensaver; edges 0 left, 1 right,
// 2 top, 3 bottom). An action chosen on a second edge swaps the two edges.
// Every folder's Global tab shows the same menu.
let gestureActions = null;
// The stored actions: each select's data-action (the select's value already
// shows a new choice when its change event runs).
function readGestureActions(scope) {
  const actions = [0, 0, 0, 0];
  scope.querySelectorAll('.gesture-edge').forEach(select => {
    actions[Number(select.dataset.edge)] = Number(select.dataset.action) || 0;
  });
  return actions;
}
function showGestureActions(actions, scope = document) {
  scope.querySelectorAll('.gesture-edge').forEach(select => {
    const action = String(actions[Number(select.dataset.edge)] || 0);
    select.value = action;
    select.dataset.action = action;
  });
}
// While a save runs the selects show the wanted actions; data-action keeps
// the stored ones until the panel answers.
function scopeGestureSelects(actions) {
  document.querySelectorAll('.gesture-edge').forEach(select => {
    select.value = String(actions[Number(select.dataset.edge)] || 0);
  });
}
// The menu as the panel keeps it (after a Settings access change, which may
// turn the Settings swipe on for a hidden tile).
async function refreshGestureMenu() {
  try {
    const response = await fetch('api/display/gestures', {cache: 'no-store'});
    if (!response.ok) return;
    const result = await response.json();
    if (!result?.success || !Array.isArray(result.actions)) return;
    gestureActions = result.actions.map(Number);
    showGestureActions(gestureActions);
  } catch (error) {
    // Offline: the menu keeps what it shows.
  }
}
async function saveGestureEdge(select) {
  const edge = Number(select.dataset.edge);
  const before = gestureActions || readGestureActions(select.closest('.gesture-settings') || document);
  // The select shows the new action already: the edge's former action is
  // the one in `before`.
  const action = Number(select.value) || 0;
  const wanted = before.slice();
  const other = action ? wanted.findIndex((value, index) => value === action && index !== edge) : -1;
  if (other >= 0) wanted[other] = before[edge];
  wanted[edge] = action;
  scopeGestureSelects(wanted);
  try {
    const response = await fetch('api/display/gestures', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({left: wanted[0], right: wanted[1], top: wanted[2], bottom: wanted[3]}).toString()
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const result = await response.json();
    if (!result?.success || !Array.isArray(result.actions)) throw new Error('invalid response');
    gestureActions = result.actions.map(Number);
    showGestureActions(gestureActions);
    if (typeof noteSettingsSwipeSaved === 'function') {
      noteSettingsSwipeSaved(gestureActions.includes(1), Number(result.settings_edge));
    }
  } catch (error) {
    gestureActions = before;
    showGestureActions(before);
    showNotification(t('networkErrorSave'), false);
  }
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
  [['.global-background-opacity', state.opacity], ['.global-background-dim', state.dim]].forEach(([selector, value]) => {
    root.querySelectorAll(selector).forEach(input => {
      if (selector === '.global-background-opacity') input.min = String(state.opacity_min);
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
