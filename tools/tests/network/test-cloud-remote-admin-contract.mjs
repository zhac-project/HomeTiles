// ZHAC Cloud remote Web Admin: the tunnel reaches the panel's own Web Admin
// from 127.0.0.1, and such a remote session cannot change how the panel
// connects, install firmware, write files or erase the crash dump (zhac-tiles
// docs/04 §4.1). The cloud refuses the same paths; the panel is the authority.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cppFunctionDefinitions} from '../../lib/cpp-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8').replaceAll('\r\n', '\n');
const fn = (source, name) => {
  const found = cppFunctionDefinitions(source).find(item => item.name === name);
  assert.ok(found, `${name} must exist`);
  return found.body;
};

// --- The tunnel targets the Web Admin, and says so at the handshake -------------
const tunnel = read('src/network/cloud/cloud_tunnel.h');
const port = Number(tunnel.match(/kLocalPort = (\d+);/)?.[1]);
const webAdmin = read('src/web/server/web_admin.cpp');
assert.equal(port, Number(webAdmin.match(/: server\((\d+)\)/)?.[1]), 'the tunnel bridges to the Web Admin port');
const client = read('src/network/cloud/cloud_topic_client.cpp');
assert.match(client, /htonl\(INADDR_LOOPBACK\)/, 'the tunnel connects to 127.0.0.1 only');
assert.match(client, /kFeatureHeader\[\] = "X-HomeTiles-Features: tunnel"/);
assert.match(fn(client, 'CloudTopicClient::configure'), /Authorization: Bearer %s\\r\\n%s\\r\\n%s", token, kFeatureHeader,\s*kFirmwareHeader\)/,
  'the feature and firmware headers travel with the Authorization header');
assert.match(client, /kFirmwareHeader\[\] = "X-HomeTiles-Firmware: " FW_VERSION;/);
{
  // "Authorization: Bearer " + token + CRLF + feature + CRLF + firmware (<= 64 incl. NUL) must fit.
  const cfg = read('src/network/cloud/cloud_config.h');
  const tokenMax = Number(cfg.match(/kTokenMax = (\d+);/)[1]);
  const extra = Number(read('src/network/cloud/cloud_topic_client.h')
    .match(/auth_header_\[24 \+ cloud_config::kTokenMax \+ (\d+)\]/)[1]);
  const need = 'Authorization: Bearer '.length + tokenMax + 2 + 'X-HomeTiles-Features: tunnel'.length + 2 + 64;
  assert.ok(24 + tokenMax + extra >= need, `auth_header_ holds ${24 + tokenMax + extra}, needs ${need}`);
  assert.match(client, /static_assert\(sizeof\(kFirmwareHeader\) <= 64/);
}
assert.match(fn(client, 'CloudTopicClient::deliver'), /kOpTunOpen[\s\S]*kOpTunData[\s\S]*kOpTunClose[\s\S]*onTunnelFrame/);
assert.match(fn(client, 'CloudTopicClient::loop'), /serviceTunnels\(\);[\s\S]*closeAllTunnels\(\);/,
  'loop() services the tunnel and closes it when the link drops');
assert.match(fn(client, 'CloudTopicClient::onDisconnected'), /closeAllTunnels\(\);/);

// --- Remote detection -------------------------------------------------------------
assert.match(fn(webAdmin, 'WebAdminServer::isRemoteRequest'), /remoteIP\(\) == IPAddress\(127, 0, 0, 1\)/);
assert.match(fn(webAdmin, 'WebAdminServer::sendRemoteRefused'), /sendJsonError\(\s*server, 403,[\s\S]*cloud_remote_blocked/);

// --- Local-only routes -------------------------------------------------------------
const start = fn(webAdmin, 'WebAdminServer::start');
const route = uri => {
  const at = start.indexOf(`"${uri}"`);
  assert.ok(at >= 0, `route ${uri} must exist`);
  const next = start.indexOf('server.on(', at);
  return start.slice(at, next < 0 ? undefined : next);
};
const localOnly = ['/api/ota/prepare', '/api/ota/install', '/api/ota/github/install', '/api/files/delete',
  '/api/files/rename', '/api/files/mkdir', '/api/coredump/erase'];
for (const uri of localOnly) assert.match(route(uri), /localOnly\(/, `${uri} is local-only`);
for (const uri of ['/api/ota/upload', '/api/ota/upload/raw', '/api/files/upload']) {
  assert.match(route(uri), /localOnly\([\s\S]*localOnlyUpload\(/, `${uri}: 403 and the upload body is dropped`);
}
for (const uri of ['/api/ota/github/check', '/api/ota/status', '/restart', '/api/tiles', '/api/screensaver',
  '/api/screenshot', '/api/upload_icon', '/api/files/list', '/bridge']) {
  assert.doesNotMatch(route(uri), /localOnly/, `${uri} stays available remotely`);
}

// --- The settings form refuses only a real connection change ----------------------
const handlers = read('src/web/server/handlers/web_admin_handlers.cpp');
const compare = fn(handlers, 'connectionSettingsChanged');
for (const field of ['wifi_ssid', 'wifi_pass', 'wifi_static_enabled', 'wifi_static_ip', 'wifi_gateway',
  'wifi_subnet', 'wifi_dns', 'ethernet_enabled', 'mqtt_host', 'mqtt_port', 'mqtt_user', 'mqtt_pass',
  'mqtt_client_id', 'mqtt_base_topic', 'ha_prefix', 'transport', 'cloud_url', 'cloud_token']) {
  assert.match(compare, new RegExp(`a\\.${field}\\b[\\s\\S]*?b\\.${field}\\b`), `${field} is compared`);
}
const save = fn(handlers, 'WebAdminServer::handleSaveMQTT');
const guard = save.indexOf('isRemoteRequest() && connectionSettingsChanged(previous_cfg, cfg)');
assert.ok(guard > 0, 'handleSaveMQTT checks remote connection changes');
assert.ok(guard > save.indexOf('server.hasArg("cloud_token")'), 'after every connection field is parsed');
assert.ok(guard < save.indexOf('configManager.save(cfg)'), 'before anything is saved');
assert.match(save.slice(guard, guard + 200), /sendSaveError\(403,[\s\S]*cloud_remote_blocked/);

// --- The page can tell it is remote --------------------------------------------------
const html = read('src/web/server/render/web_admin_html.cpp');
assert.match(fn(html, 'WebAdminServer::getStatusJSON'), /\\"remote\\":[\s\S]*isRemoteRequest\(\)/);

// --- The refusal is translated -------------------------------------------------------
const i18n = read('src/core/i18n/i18n.cpp');
const lastLiteral = table => {
  const begin = i18n.indexOf(`static const Strings ${table} = {`);
  const block = i18n.slice(begin, i18n.indexOf('};', begin));
  return [...block.matchAll(/"((?:[^"\\]|\\.)*)"/g)].at(-1)[1];
};
const [de, en, fr] = ['kStringsDe', 'kStringsEn', 'kStringsFr'].map(lastLiteral);
assert.match(read('src/core/i18n/i18n.h'), /const char\* cloud_remote_blocked;\s*\};/, 'the last Strings field');
assert.match(en, /remote session/);
assert.notEqual(de, en);
assert.notEqual(fr, en);

console.log('cloud remote admin contract passed');
