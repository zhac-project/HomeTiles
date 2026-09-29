// ZHAC Cloud transport source contract: the panel token is write-only, the
// server certificate is verified, refusals back off for minutes, the worker
// keeps sole ownership of the socket, and every language translates the new
// Web Admin texts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cppFunctionDefinitions} from '../../lib/cpp-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8').replaceAll('\r\n', '\n');

// --- The token never leaves the panel ---------------------------------------
const html = read('src/web/server/render/web_admin_html.cpp');
const tokenUses = html.match(/[\w.]*cloud_token[\w[\]]*/g) || [];
for (const use of tokenUses) {
  assert.ok(['cfg.cloud_token[0]', 'cloud_token', 'cloud_token_set', 'cloud_token_label',
    'cloud_token_stored', 'cloud_token_missing', 'tr.cloud_token_label',
    'tr.cloud_token_stored', 'tr.cloud_token_missing'].includes(use),
  `web_admin_html.cpp may only test whether a token is stored, found "${use}"`);
}
assert.match(html, /id="cloud_token" name="cloud_token"[^>]*value=""/,
  'The token input must always render empty');
assert.match(html, /\\"cloud_token_set\\":/, '/status reports only whether a token is stored');

const handlers = read('src/web/server/handlers/web_admin_handlers.cpp');
for (const line of handlers.split('\n').filter(l => l.includes('cloud_token'))) {
  assert.doesNotMatch(line, /response|json|html|Serial/,
    `the save handler must not echo or log the token: ${line.trim()}`);
}
const config = read('src/core/config/config_manager.cpp');
for (const line of config.split('\n').filter(l => l.includes('Serial.print'))) {
  assert.doesNotMatch(line, /cloud_token/, 'the token is never logged');
}

// --- TLS, logging and threading in the transport ----------------------------
const client = read('src/network/cloud/cloud_topic_client.cpp');
assert.match(client, /beginSslWithBundle\(/, 'wss must verify the cloud against the CA bundle');
assert.doesNotMatch(client, /setInsecure/, 'certificate checks must never be disabled');
for (const line of client.split('\n').filter(l => /Serial\.print/.test(l))) {
  assert.doesNotMatch(line, /auth_header_|token/, `no token in logs: ${line.trim()}`);
}
assert.doesNotMatch(client, /#include\s+[<"](lvgl|LittleFS|Preferences|src\/ui)/,
  'the worker-side transport must not touch LVGL, flash or UI state');
assert.match(client, /kSubprotocol\[\] = "hometiles\.v1"/);

// The firmware supplies the CA bundle symbols itself (ESP-IDF common CA set),
// so the core's full 69 KB bundle is not linked; the Tab5 app slot is full.
const bundle = read('src/network/cloud/cloud_ca_bundle.cpp');
const declared = bundle.match(/kHomeTilesCaBundle\[(\d+)\] asm\(\s*"_binary_x509_crt_bundle_start"\)/);
assert.ok(declared, 'cloud_ca_bundle.cpp defines _binary_x509_crt_bundle_start');
const bytes = (bundle.match(/0x[0-9a-f]{2},/g) || []).length;
assert.equal(bytes, Number(declared[1]), 'the array holds exactly the declared bundle size');
assert.match(bundle, new RegExp(`\\.set _binary_x509_crt_bundle_end, _binary_x509_crt_bundle_start \\+ ${bytes}\\\\n`),
  '_binary_x509_crt_bundle_end marks the end of the same bytes');
assert.ok(bytes < 24 * 1024, 'keep the bundle small; the full Mozilla bundle does not fit every profile');
assert.match(client, /kCloudCaBundleStart\[\] asm\("_binary_x509_crt_bundle_start"\)/);
assert.match(client, /kCloudCaBundleEnd\[\] asm\("_binary_x509_crt_bundle_end"\)/);

// Vendored WebSocket client patches that the transport relies on.
const wsHeader = read('src/network/vendor/arduinowebsockets/WebSockets.h');
assert.match(wsHeader, /#define WEBSOCKETS_MAX_DATA_SIZE \(4 \+ 1024 \+ 65535\)/,
  'frames up to the hometiles.v1 maximum must not close the socket');
const wsSource = read('src/network/vendor/arduinowebsockets/WebSockets.cpp');
assert.match(wsSource, /HomeTiles patch[\s\S]{0,200}messageReceived\(client, header->opCode, payload, header->payloadLen, header->fin\);\s*clientDisconnect\(client, 1000\);/,
  'close frames must reach messageReceived so the close code is visible');

// --- Refusals wait for minutes, not seconds ---------------------------------
const network = read('src/network/network_manager.cpp');
const retry = network.match(/kCloudRefusalRetryMs = (\d+)UL \* (\d+)UL \* (\d+)UL;/);
assert.ok(retry, 'kCloudRefusalRetryMs must exist');
assert.ok(Number(retry[1]) * Number(retry[2]) * Number(retry[3]) >= 10 * 60 * 1000,
  'a refused panel must not retry more often than every 10 minutes');
const fn = name => {
  const found = cppFunctionDefinitions(network).find(item => item.name === name);
  assert.ok(found, `${name} must exist`);
  return found.body;
};
assert.match(fn('HomeTilesNetworkManager::connectMqtt'),
  /cloudRefused\(\) \? kCloudRefusalRetryMs/, 'a refused handshake uses the long retry');
assert.match(fn('HomeTilesNetworkManager::serviceMqttWorker'),
  /if \(cloudRefused\(\)\) mqtt_retry_at = millis\(\) \+ kCloudRefusalRetryMs;/,
  'a close with 1008/4402 uses the long retry');

// --- Every language translates the new texts, at their members' positions ---
// The Strings tables are positional. A block merged in another order than in
// i18n.h still compiles and shows the wrong labels, so every cloud text is
// pinned to its member by name, in every language.
const header = read('src/core/i18n/i18n.h');
const structStart = header.indexOf('struct Strings {');
const members = [...header.slice(structStart, header.indexOf('\n};', structStart))
  .matchAll(/^\s*const char\* (\w+);/gm)].map(match => match[1]);
const cloudFields = members.filter(name => /^(?:admin_settings_cloud|cloud_[a-z_]+)$/.test(name));
const i18n = read('src/core/i18n/i18n.cpp');
const languages = ['kStringsDe', 'kStringsEn', 'kStringsFr'];
const tables = {};
for (const name of languages) {
  const start = i18n.indexOf(`static const Strings ${name} = {`);
  assert.ok(start >= 0, `${name} must exist`);
  const literals = [...i18n.slice(start, i18n.indexOf('};', start)).matchAll(/"((?:[^"\\]|\\.)*)"/g)]
    .map(m => m[1]);
  // One literal per member, so a literal's index is its member's index.
  assert.equal(literals.length, members.length, `${name} has one literal per Strings member`);
  tables[name] = Object.fromEntries(members.map((member, index) => [member, literals[index]]));
}
const expected = {
  admin_settings_cloud: ['ZHAC Cloud', 'ZHAC Cloud', 'ZHAC Cloud'],
  cloud_transport_label: ['Verbindung', 'Connection', 'Connexion'],
  cloud_transport_mqtt: ['MQTT-Broker', 'MQTT broker', 'Broker MQTT'],
  cloud_transport_cloud: ['ZHAC Cloud', 'ZHAC Cloud', 'ZHAC Cloud'],
  cloud_url_label: ['Cloud-URL', 'Cloud URL', 'URL du cloud'],
  cloud_token_label: ['Panel-Token', 'Panel token', 'Jeton du panneau'],
  cloud_token_stored: ['Gespeichert – leer lassen, um es zu behalten', 'Stored – leave empty to keep it',
    'Enregistré – laisser vide pour le conserver'],
  cloud_token_missing: ['Nicht gesetzt', 'Not set', 'Non défini'],
  cloud_note: [
    'URL und Token einfügen, die ZHAC Cloud beim Hinzufügen dieses Panels anzeigt. Das Token wird hier nie wieder angezeigt.',
    'Paste the URL and token that ZHAC Cloud shows when you add this panel. The token is never shown here again.',
    "Collez l'URL et le jeton affichés par ZHAC Cloud lors de l'ajout de ce panneau. Le jeton n'est plus jamais affiché ici."],
  cloud_url_invalid: ['Die Cloud-URL muss mit wss:// oder ws:// beginnen.', 'The cloud URL must start with wss:// or ws://.',
    "L'URL du cloud doit commencer par wss:// ou ws://."],
  cloud_token_invalid: ['Das Panel-Token ist ungültig.', 'The panel token is not valid.', "Le jeton du panneau n'est pas valide."],
  cloud_status_off: ['Nicht verwendet', 'Not used', 'Non utilisé'],
  cloud_status_connecting: ['Nicht verbunden', 'Not connected', 'Non connecté'],
  cloud_status_connected: ['Verbunden', 'Connected', 'Connecté'],
  cloud_status_unauthorized: ['Token abgelehnt', 'Token rejected', 'Jeton refusé'],
  cloud_status_token_revoked: ['Token widerrufen', 'Token revoked', 'Jeton révoqué'],
  cloud_status_plan_required: ['Tarif erforderlich', 'Plan required', 'Abonnement requis'],
  cloud_status_forbidden: ['Zugriff verweigert', 'Access denied', 'Accès refusé'],
  cloud_remote_blocked: ['In einer Fernsitzung nicht verfügbar: bitte im lokalen Netzwerk des Panels ändern.',
    "Not available in a remote session: change it on the panel's local network.",
    'Indisponible en session à distance : modifiez-le sur le réseau local du panneau.'],
};
assert.deepEqual(cloudFields, Object.keys(expected), 'the 19 cloud strings, in declaration order');
for (const [field, texts] of Object.entries(expected)) {
  languages.forEach((name, language) => assert.equal(tables[name][field], texts[language], `${name}.${field}`));
}
const statusText = cppFunctionDefinitions(html).find(item => item.name === 'cloudStatusText')?.body;
assert.ok(statusText, 'cloudStatusText must exist in web_admin_html.cpp');
for (const field of cloudFields.filter(f => f.startsWith('cloud_status_'))) {
  assert.match(statusText, new RegExp(`tr\\.${field}\\b`), `${field} is rendered in the Web Admin`);
}

console.log('cloud transport contract passed');
