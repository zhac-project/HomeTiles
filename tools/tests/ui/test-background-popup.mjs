// Source contract for Settings › Display › Background: the 15 device strings
// in every language at their members' positions, the popup's controls, where
// settings are saved, and the status and reason texts.
import assert from 'node:assert/strict';

import {readRepoFile} from '../../lib/admin-source.mjs';
import {cppFunctionDefinitions} from '../../lib/cpp-source.mjs';

// --- Strings: positional tables, pinned to their members by name ---
const header = readRepoFile('src', 'core', 'i18n', 'i18n.h');
const structStart = header.indexOf('struct Strings {');
const members = [...header.slice(structStart, header.indexOf('\n};', structStart))
  .matchAll(/^\s*const char\* (\w+);/gm)].map((match) => match[1]);
const expected = {
  background_label: ['Hintergrund', 'Background', 'Arrière-plan'],
  background_photo_label: ['Foto:', 'Photo:', 'Photo :'],
  background_opacity_label: ['Kachel-Deckkraft:', 'Tile opacity:', 'Opacité des tuiles :'],
  background_dim_label: ['Foto abdunkeln:', 'Dim photo:', 'Assombrir la photo :'],
  background_none: ['Keins', 'None', 'Aucune'],
  background_hint: ['Fotos von der microSD-Karte, Ordner /images (JPEG)',
    'Photos from the microSD card, folder /images (JPEG)', 'Photos de la carte microSD, dossier /images (JPEG)'],
  background_no_card: ['Keine microSD-Karte', 'No microSD card', 'Pas de carte microSD'],
  background_loading: ['Foto wird geladen…', 'Loading photo…', 'Chargement de la photo…'],
  background_not_found: ['Nicht gefunden', 'Not found', 'Introuvable'],
  background_no_memory: ['Nicht genug Speicher', 'Not enough memory', 'Mémoire insuffisante'],
  background_cant_progressive: ['Nicht nutzbar: progressives JPEG', 'Can’t use: progressive JPEG',
    'Inutilisable : JPEG progressif'],
  background_cant_too_big: ['Nicht nutzbar: über 8 MB', 'Can’t use: over 8 MB', 'Inutilisable : plus de 8 Mo'],
  background_cant_too_large: ['Nicht nutzbar: über 4,2 MP', 'Can’t use: over 4.2 MP', 'Inutilisable : plus de 4,2 Mpx'],
  background_cant_unreadable: ['Nicht nutzbar: kein lesbares JPEG', 'Can’t use: not a readable JPEG',
    'Inutilisable : JPEG illisible'],
  background_cant_name: ['Nicht nutzbar: Dateiname', 'Can’t use: file name', 'Inutilisable : nom de fichier'],
};
const anchor = members.indexOf('cloud_remote_blocked');
assert.deepEqual(members.slice(anchor + 1, anchor + 16), Object.keys(expected),
  'the 15 members follow cloud_remote_blocked in order');
const i18n = readRepoFile('src', 'core', 'i18n', 'i18n.cpp');
['kStringsDe', 'kStringsEn', 'kStringsFr'].forEach((name, language) => {
  const start = i18n.indexOf(`static const Strings ${name} = {`);
  assert.ok(start >= 0, `${name} must exist`);
  const literals = [...i18n.slice(start, i18n.indexOf('};', start)).matchAll(/"((?:[^"\\]|\\.)*)"/g)]
    .map((match) => match[1]);
  assert.equal(literals.length, members.length, `${name} has one literal per Strings member`);
  for (const [member, texts] of Object.entries(expected)) {
    assert.equal(literals[members.indexOf(member)], texts[language], `${name}.${member}`);
  }
});

// --- Status and reason texts ---
const photo = cppFunctionDefinitions(readRepoFile('src', 'ui', 'background', 'background_photo.cpp'));
const body = (definitions, name) => {
  const found = definitions.find((definition) => definition.name === name);
  assert.ok(found, `${name} is missing`);
  return found.body;
};
const statusText = body(photo, 'status_text');
for (const status of ['None', 'Loading', 'Shown', 'NoCard', 'NotFound', 'Unusable', 'NoMemory']) {
  assert.ok(statusText.includes(`Status::${status}`), `status_text names Status::${status}`);
}
const reasonText = body(photo, 'reason_text');
for (const reason of ['Progressive', 'TooBig', 'TooLarge', 'Unreadable', 'BadName']) {
  assert.ok(reasonText.includes(`Reason::${reason}`), `reason_text names Reason::${reason}`);
}

// --- Popup ---
const settings = readRepoFile('src', 'ui', 'tabs', 'settings', 'tab_settings.cpp');
const defs = cppFunctionDefinitions(settings);
assert.match(settings, /enum class SettingsPopupKind : uint8_t \{[^}]*\bBackground\b/);
const display = body(defs, 'build_display_popup');
assert.equal(display.split('create_popup_button(').length - 1, 2, 'Rotate and Background');
assert.equal((display.match(/create_popup_button\([^;]*0x26A69A/g) || []).length, 2);
// The slider rows already grow; the two buttons share their row equally.
assert.equal((display.match(/lv_obj_set_flex_grow\(display_(?:rotate|background)_btn, 1\)/g) || []).length, 2);
const popup = body(defs, 'build_background_popup');
assert.equal(popup.split('create_display_control_row(').length - 1, 2);
assert.equal(popup.split('style_settings_slider(').length - 1, 2);
assert.ok(popup.includes('Device::kTileOpacityPercentMin') && popup.includes('background_rules::kMaxDim'));
const field = body(defs, 'on_background_photo_field_clicked');
assert.ok(field.includes('background_photo::list(') && field.includes('ui_control_style::dropdownList('));
// show_popup_shell hides the Settings overlay and moves the card into the shared
// shell. On the hidden overlay the photo list never showed and every later tap
// returned early; it lives on the card, outside its flex column, like the Wi-Fi keyboard.
assert.match(field, /background_list_catcher = lv_obj_create\(settings_popup_card\);/);
assert.match(field, /lv_obj_add_flag\(background_list_catcher, LV_OBJ_FLAG_IGNORE_LAYOUT\);/);
assert.doesNotMatch(settings, /_create\(settings_popup_overlay\)/,
  'show_popup_shell hides settings_popup_overlay: nothing may be created on it');
for (const definition of defs.filter((d) => d.body.includes('saveBackground('))) {
  assert.ok(definition.name === 'on_background_list_row_clicked' || definition.body.includes('LV_EVENT_RELEASED'),
    `${definition.name} saves only on a row tap or a slider release`);
}
assert.equal(defs.filter((d) => d.body.includes('saveBackground(')).length, 3);
// "Loading photo…" must be on screen before the decode blocks the UI thread
// 50 ms later; the 250 ms status refresh would usually miss that window.
assert.match(body(defs, 'background_apply_now'),
  /background_photo::process_pending\(\);[\s\S]*background_update_status\(\)/);
for (const definition of defs.filter((d) => d.body.includes('saveBackground('))) {
  assert.match(definition.body, /request_apply\(\);\s*background_apply_now\(\);/,
    `${definition.name} applies and shows the new status at once`);
}
assert.match(body(defs, 'on_settings_popup_close_clicked'),
  /SettingsPopupKind::Background[\s\S]*open_settings_popup\(SettingsPopupKind::Display\)/);
assert.ok(body(defs, 'close_settings_popup').includes('background_status_timer'),
  'the 250 ms status timer dies with the popup');

// The sliders pass the saved name back in; the copy must not overlap itself.
const save = body(cppFunctionDefinitions(readRepoFile('src', 'core', 'config', 'config_manager.cpp')),
  'ConfigManager::saveBackground');
assert.match(save, /if \(photo != config\.background_photo\)/);

console.log('background popup source contract: PASS');
