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

// --- Every language translates the new texts --------------------------------
const header = read('src/core/i18n/i18n.h');
const cloudFields = [...header.matchAll(/const char\* ((?:admin_settings_cloud|cloud_[a-z_]+));/g)]
  .map(match => match[1]);
assert.equal(cloudFields.length, 19, 'expected the 19 cloud strings');
const i18n = read('src/core/i18n/i18n.cpp');
const tables = {};
for (const name of ['kStringsDe', 'kStringsEn', 'kStringsFr']) {
  const start = i18n.indexOf(`static const Strings ${name} = {`);
  assert.ok(start >= 0, `${name} must exist`);
  const end = i18n.indexOf('};', start);
  const literals = [...i18n.slice(start, end).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]);
  tables[name] = literals.slice(-cloudFields.length);
  for (const [index, text] of tables[name].entries()) {
    assert.ok(text.length > 0, `${name}.${cloudFields[index]} must not be empty`);
  }
}
const status = cloudFields.indexOf('cloud_status_plan_required');
assert.notEqual(tables.kStringsDe[status], tables.kStringsEn[status], 'German status is translated');
assert.notEqual(tables.kStringsFr[status], tables.kStringsEn[status], 'French status is translated');
const statusText = cppFunctionDefinitions(html).find(item => item.name === 'cloudStatusText')?.body;
assert.ok(statusText, 'cloudStatusText must exist in web_admin_html.cpp');
for (const field of cloudFields.filter(f => f.startsWith('cloud_status_'))) {
  assert.match(statusText, new RegExp(`tr\\.${field}\\b`), `${field} is rendered in the Web Admin`);
}

console.log('cloud transport contract passed');
