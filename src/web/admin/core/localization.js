function t(key) {
    return Object.prototype.hasOwnProperty.call(APP_I18N, key) ? APP_I18N[key] : key;
  }
  function tf(key, replacements) {
    let out = t(key);
    if (!replacements) return out;
    Object.keys(replacements).forEach(name => {
      out = out.replaceAll('{' + name + '}', String(replacements[name]));
    });
    return out;
  }
  let APP_LOCALE = document.documentElement.lang || 'en';

  // Issue #73: the panel builds this page in its own language, so a language
  // change made on the display shows only after a reload. A small poll
  // notices it and reloads once nothing is being edited here.
  const DEVICE_LANGUAGE_POLL_MS = 15000;

  function adminEditsPending() {
    if (typeof layoutWindowOpen === 'function' && layoutWindowOpen()) return true;
    const active = document.activeElement;
    if (active?.matches?.('input, textarea, select')) return true;
    if (dragSource || resizeState || fileManagerUploadBusy || hardwareIoDirty) return true;
    const busy = map => Object.values(map || {}).some(Boolean);
    return busy(autoSaveTimers) || busy(saveInFlightByTile) || busy(queuedSaveByTile);
  }

  // The page's Web Admin password state (the header badge), null without it.
  function pageWebAuth() {
    const badge = document.getElementById('web_auth_badge');
    return badge ? badge.classList.contains('is-on') : null;
  }

  async function checkDeviceLanguage() {
    if (document.hidden) return;
    try {
      const response = await fetch('api/language', {cache: 'no-store'});
      // A password set on the panel: this page now needs the login.
      if (response.status === 401 && pageWebAuth() === false && !adminEditsPending()) location.reload();
      if (!response.ok) return;
      const data = await response.json();
      applyPanelClockFormats(Number(data?.time_format), Number(data?.date_format));
      if (typeof applyPanelThemeFromDevice === 'function') applyPanelThemeFromDevice(data?.theme, data?.theme_shown);
      const device = String(data?.language || '').toLowerCase();
      const page = String(document.documentElement.lang || APP_LOCALE).toLowerCase();
      // The language or the password changed on the panel (user 2026-10-15:
      // a password removed there showed only after a reload).
      const auth = data?.web_auth === undefined ? null : Number(data.web_auth) === 1;
      const authChanged = auth !== null && pageWebAuth() !== null && auth !== pageWebAuth();
      if (((device && device !== page) || authChanged) && !adminEditsPending()) location.reload();
    } catch (error) {
      // Offline or signed out: the next poll tries again.
    }
  }

  // A time or date format changed on the panel or in Settings: the head's
  // time and every clock preview on "Auto" follow without a reload.
  function applyPanelClockFormats(time, date) {
    const timeChanged = [1, 2].includes(time) && typeof PANEL_TIME_FORMAT === 'number' && time !== PANEL_TIME_FORMAT;
    const dateChanged = [1, 2, 3].includes(date) && typeof PANEL_DATE_FORMAT === 'number' && date !== PANEL_DATE_FORMAT;
    if (!timeChanged && !dateChanged) return;
    if (timeChanged) PANEL_TIME_FORMAT = time;
    if (dateChanged) PANEL_DATE_FORMAT = date;
    if (typeof refreshHeadBarTime === 'function') refreshHeadBarTime();
    if (typeof tileDataLoadedTabs !== 'undefined' && typeof renderTileFromData === 'function') {
      tileDataLoadedTabs.forEach(tab => {
        getTilesData(tab).forEach((tile, index) => {
          if (tile && String(tile.type) === '9') renderTileFromData(tab, index, tile, sensorMetaCache);
        });
      });
    }
    if (typeof screensaverLoaded !== 'undefined' && screensaverLoaded && typeof renderScreensaverEditor === 'function') {
      renderScreensaverEditor();
    }
  }

  function watchDeviceLanguage() {
    window.setInterval(checkDeviceLanguage, DEVICE_LANGUAGE_POLL_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) checkDeviceLanguage();
    });
  }
  function formatLocalizedNumber(value, decimals = 0, trimTrailingZeros = false) {
    const numeric = Number(String(value ?? '').trim().replace(',', '.'));
    if (!Number.isFinite(numeric)) return '--';
    const digits = Math.max(0, Math.min(6, Number.parseInt(decimals, 10) || 0));
    return new Intl.NumberFormat(APP_LOCALE, {
      useGrouping: false,
      minimumFractionDigits: trimTrailingZeros ? 0 : digits,
      maximumFractionDigits: digits
    }).format(numeric);
  }
  function localizeNumericText(value) {
    const text = String(value ?? '').trim();
    if (!text.length) return text;
    const normalized = text.replace(',', '.');
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return text;
    const fraction = normalized.includes('.') ? normalized.split('.')[1].length : 0;
    return formatLocalizedNumber(Number(normalized), fraction, false);
  }
