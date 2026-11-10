// Source contract for Settings › Display › Background: the 15 device strings
// in every language at their members' positions, the group's controls on the
// Display page (settings_screen.cpp over settings_model.h), where settings are
// saved, and the status and reason texts.
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

// --- Display page group ---
const screen = cppFunctionDefinitions(readRepoFile('src', 'ui', 'tabs', 'settings', 'settings_screen.cpp'));
const page = body(screen, 'build_display_page');
const group = page.slice(page.indexOf('settings_parts::section(page, s.background_label'));
assert.ok(group.length > 0, 'a Background section on the Display page');
assert.match(group, /settings_parts::row\(background, "image", s\.admin_background_photo, line\)/);
assert.equal(group.split('display_slider_row(').length - 1, 2, 'opacity and dim sliders');
assert.match(group, /if \(!back\.photo\) lv_obj_add_state\(slider, LV_STATE_DISABLED\)/, 'dimmed without a photo');
const open = body(screen, 'on_background_row_clicked');
assert.ok(open.indexOf('background_list_read()') < open.indexOf('open_options('), 'the list reads the card first');
assert.match(body(screen, 'on_page_timer'), /Category::Display\) background_tick\(\)/,
  '"Loading photo…" turns into the final state');
for (const name of ['on_background_opacity', 'on_background_dim']) {
  assert.match(body(screen, name), /if \(final\) background_tick\(\);/, `${name} shows the new status at once`);
}

const settings = cppFunctionDefinitions(readRepoFile('src', 'ui', 'tabs', 'settings', 'tab_settings.cpp'));
assert.equal(settings.filter((d) => d.body.includes('saveBackground(')).length, 1, 'one save path');
// "Loading photo…" must be on screen before the decode blocks the UI thread
// 50 ms later; the page timer would usually miss that window.
assert.match(body(settings, 'background_save'),
  /saveBackground\([^;]*\)\) return;\s*background_photo::request_apply\(\);\s*background_photo::process_pending\(\);/);
for (const name of ['background_opacity_changed', 'background_dim_changed']) {
  assert.match(body(settings, name), /if \(!final\) return;/, `${name} saves on release only`);
}
assert.match(body(settings, 'background_selected_changed'), /Reason::Usable\)\)\s*\{\s*return;/,
  'unusable photos are not taken');
for (const name of ['background_values', 'background_step', 'background_line', 'background_list_read',
  'background_option_count', 'background_option', 'background_selected', 'background_selected_changed',
  'background_opacity_changed', 'background_dim_changed']) {
  assert.ok(readRepoFile('tools', 'settings-preview.mjs').includes(` ${name}(`), `the preview defines ${name}`);
}

// The sliders pass the saved name back in; the copy must not overlap itself.
const save = body(cppFunctionDefinitions(readRepoFile('src', 'core', 'config', 'config_manager.cpp')),
  'ConfigManager::saveBackground');
assert.match(save, /if \(photo != config\.background_photo\)/);

console.log('background popup source contract: PASS');
