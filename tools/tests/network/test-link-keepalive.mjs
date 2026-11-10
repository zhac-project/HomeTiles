// Link keepalive (docs-dev/bridge-link.md): the panel pings when it has sent
// nothing or received nothing for 15 seconds, at most once per 15 seconds.
// A panel that keeps publishing into a quiet Home Assistant still gets the
// Bridge's pong, so its 45 s idle timeout only fires on a dead connection.
import assert from 'node:assert/strict';

import {readRepoFile} from '../../lib/admin-source.mjs';

const client = readRepoFile('src/network/link/bridge_link_client.cpp');
const header = readRepoFile('src/network/link/bridge_link_client.h');
const loopStart = client.indexOf('bool BridgeLinkClient::loop()');
assert.ok(loopStart >= 0, 'missing BridgeLinkClient::loop');
const loop = client.slice(loopStart, client.indexOf('\n}\n', loopStart));

const ping = loop.match(/if \(([^{]*)\) \{\s*last_ping_ms_ = now;\s*if \(!sendFrame\(kPing, nullptr, 0\)\) return false;/);
assert.ok(ping, 'the ping records its time');
const condition = ping[1].replace(/\s+/g, ' ');
assert.match(condition, /now - last_ping_ms_\) >= kPingIdleMs/, 'at most one ping per kPingIdleMs');
assert.match(condition, /now - last_tx_ms_\) >= kPingIdleMs/, 'a ping after nothing was sent');
assert.match(condition, /now - last_rx_ms_\) >= kPingIdleMs/, 'a ping after nothing came back');
assert.match(condition, /\|\|/, 'either silence is enough');
assert.match(header, /uint32_t last_ping_ms_ = 0;/);
assert.match(client, /last_rx_ms_ = last_tx_ms_ = last_ping_ms_ = millis\(\);/, 'a new connection starts the clocks');

// The rule on a timeline: the panel publishes every 2.6 s, the Bridge only
// answers pings. The receive side must never stay silent for 45 s.
const kPingIdleMs = 15000;
const kIdleTimeoutMs = 45000;
let lastRx = 0;
let lastTx = 0;
let lastPing = 0;
let pongDue = -1;
for (let now = 0; now <= 10 * 60 * 1000; now += 100) {
  if (pongDue >= 0 && now >= pongDue) {
    lastRx = now;
    pongDue = -1;
  }
  assert.ok(now - lastRx < kIdleTimeoutMs, `the link timed out at ${now} ms`);
  if (now - lastPing >= kPingIdleMs && (now - lastTx >= kPingIdleMs || now - lastRx >= kPingIdleMs)) {
    lastPing = now;
    lastTx = now;
    pongDue = now + 50;
  }
  if (now % 2600 === 0) lastTx = now;
}

console.log('Link keepalive: a ping after silence either way, one per 15 s, no timeout on one-way traffic');
