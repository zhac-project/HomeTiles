// A panel on the direct link never logs MQTT (user 2026-10-15): shared
// network logs take their tag from networkManager.bridgeLogName() ("Link" or
// "MQTT"), and the word MQTT stays only in lines that run over MQTT alone.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {readRepoFile} from '../../lib/admin-source.mjs';

const root = path.resolve(new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'vendor') walk(full);
    } else if (/\.(cpp|h)$/.test(entry.name)) {
      files.push(full);
    }
  }
};
walk(path.join(root, 'src'));
files.push(path.join(root, 'HomeTiles.ino'));

// Lines that only run while MQTT is used (broker connect, a configured
// broker in the settings dump, leaving the broker for the link).
const mqttOnly = [
  /"\[MQTT\] Connected to the broker"/,
  /"\[MQTT\] Connecting to %s:%u as %s\\n"/,
  /"  MQTT Host: %s:%u\\n"/,
  /"  MQTT User: %s\\n"/,
  /"\[Link\] Cleared %u retained MQTT messages before leaving the broker\\n"/,
];

const offenders = [];
for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!/Serial\.(printf|println|print)\(|log_memory_status\(|logNetworkHeap\(/.test(line)) return;
    const literals = line.match(/"(?:[^"\\]|\\.)*"/g) || [];
    if (!literals.some((text) => /mqtt/i.test(text))) return;
    if (mqttOnly.some((allowed) => allowed.test(line))) return;
    offenders.push(`${path.relative(root, file)}:${index + 1}: ${line.trim()}`);
  });
}
assert.deepEqual(offenders, [], 'log lines that name MQTT on the link');

const header = readRepoFile('src/network/network_manager.h');
assert.match(header, /const char\* bridgeLogName\(\) const \{ return link_configured_ \? "Link" : "MQTT"; \}/);
const handlers = readRepoFile('src/network/mqtt/mqtt_handlers.cpp');
assert.doesNotMatch(handlers, /subscribe queued %s/, 'one summary line instead of one line per topic');
assert.match(handlers, /"\[%s\] %u fixed subscriptions queued\\n", networkManager\.bridgeLogName\(\), queued\);/);

console.log(`Link log names: no MQTT in ${files.length} source files except MQTT-only lines`);
