// ZHAC Cloud transport: the hometiles.v1 frame codec and the cloud URL/token
// validation are the panel's half of the wire contract with the cloud plugin
// (zhac-tiles docs/04 §4). This harness compiles the production headers on the
// host and runs encode/decode and parser vectors, including malformed input.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const out = path.join(root, 'build/tests/cloud-frame-codec');
fs.mkdirSync(out, {recursive: true});

const cpp = String.raw`
#include <cassert>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>
#include "src/network/cloud/cloud_config.h"
#include "src/network/cloud/cloud_frame.h"

using namespace cloud_frame;

static std::vector<uint8_t> frame(uint8_t op, bool retain, const char* topic,
                                  const std::string& payload) {
  std::vector<uint8_t> buf(kMaxFrameBytes + 16);
  const size_t head = encodeHead(op, retain, topic, payload.size(), buf.data(), buf.size());
  assert(head != 0);
  memcpy(buf.data() + head, payload.data(), payload.size());
  buf.resize(head + payload.size());
  return buf;
}

int main() {
  // PUB with retain: exact bytes, big-endian topic length.
  std::vector<uint8_t> pub = frame(kOpPub, true, "a/b", "on");
  const uint8_t expected[] = {0x01, 0x01, 0x00, 0x03, 'a', '/', 'b', 'o', 'n'};
  assert(pub.size() == sizeof(expected));
  assert(memcmp(pub.data(), expected, sizeof(expected)) == 0);

  Frame f{};
  assert(decode(pub.data(), pub.size(), &f));
  assert(f.op == kOpPub && f.retain);
  assert(f.topic_len == 3 && memcmp(f.topic, "a/b", 3) == 0);
  assert(f.payload_len == 2 && memcmp(f.payload, "on", 2) == 0);

  // Retain applies to PUB and WILL only; SUB/UNSUB never carry a payload.
  std::vector<uint8_t> will = frame(kOpWill, true, "base/stat/connected", "0");
  assert(will[1] == kFlagRetain);
  std::vector<uint8_t> sub = frame(kOpSub, true, "x", "");
  assert(sub[0] == kOpSub && sub[1] == 0);
  uint8_t small[64];
  assert(encodeHead(kOpSub, false, "x", 1, small, sizeof(small)) == 0);
  assert(encodeHead(kOpUnsub, false, "x", 0, small, sizeof(small)) == 5);

  // Empty payload is valid for PUB.
  std::vector<uint8_t> empty = frame(kOpPub, false, "t", "");
  assert(decode(empty.data(), empty.size(), &f) && f.payload_len == 0 && !f.retain);

  // Topic length 1..1024, payload up to 65,535.
  std::string topic1024(1024, 't');
  std::string topic1025(1025, 't');
  assert(encodeHead(kOpPub, false, "", 0, small, sizeof(small)) == 0);
  std::vector<uint8_t> big(kMaxFrameBytes + 16);
  assert(encodeHead(kOpPub, false, topic1024.c_str(), kMaxPayloadBytes, big.data(), big.size()) == 1028);
  assert(encodeHead(kOpPub, false, topic1025.c_str(), 0, big.data(), big.size()) == 0);
  assert(encodeHead(kOpPub, false, "t", kMaxPayloadBytes + 1, big.data(), big.size()) == 0);
  assert(encodeHead(0x05, false, "t", 0, big.data(), big.size()) == 0);
  assert(encodeHead(kOpPub, false, "abc", 0, small, 6) == 0);  // out too small
  std::vector<uint8_t> max = frame(kOpPub, false, topic1024.c_str(), std::string(kMaxPayloadBytes, 'p'));
  assert(max.size() == kMaxFrameBytes);
  assert(decode(max.data(), max.size(), &f) && f.topic_len == 1024 && f.payload_len == kMaxPayloadBytes);
  assert(!decode(max.data(), max.size() + 1, &f));  // one byte past the largest frame

  // Malformed input is rejected, never read past the end.
  const uint8_t short_frame[] = {0x01, 0x00, 0x00};
  assert(!decode(short_frame, sizeof(short_frame), &f));
  const uint8_t bad_op[] = {0x05, 0x00, 0x00, 0x01, 't'};
  assert(!decode(bad_op, sizeof(bad_op), &f));
  const uint8_t zero_topic[] = {0x01, 0x00, 0x00, 0x00, 'p'};
  assert(!decode(zero_topic, sizeof(zero_topic), &f));
  const uint8_t topic_past_end[] = {0x01, 0x00, 0x00, 0x05, 'a', 'b'};
  assert(!decode(topic_past_end, sizeof(topic_past_end), &f));
  const uint8_t topic_too_long[] = {0x01, 0x00, 0x04, 0x01, 't'};
  assert(!decode(topic_too_long, sizeof(topic_too_long), &f));
  const uint8_t topic_nul[] = {0x01, 0x00, 0x00, 0x03, 'a', 0x00, 'b'};
  assert(!decode(topic_nul, sizeof(topic_nul), &f));
  assert(!decode(nullptr, 8, &f));

  // ERR from the cloud: topic = code, payload = text. Reserved flag bits ignored.
  const uint8_t err[] = {0x7F, 0xFE, 0x00, 0x04, 'p', 'l', 'a', 'n', 'x'};
  assert(decode(err, sizeof(err), &f) && f.op == kOpErr && !f.retain && f.payload_len == 1);
  const uint8_t long_topic[] = {0x01, 0x00, 0x01, 0x00};  // 256-byte topic, missing
  assert(!decode(long_topic, sizeof(long_topic), &f));

  // Cloud URL: wss (443) and ws (80, LAN test cloud), explicit port and path.
  cloud_config::Endpoint e{};
  assert(cloud_config::parseUrl("wss://cloud.zhac.io/plugins/hometiles/ws/panel", &e));
  assert(e.tls && e.port == 443 && strcmp(e.host, "cloud.zhac.io") == 0);
  assert(strcmp(e.path, "/plugins/hometiles/ws/panel") == 0);
  assert(cloud_config::parseUrl("ws://192.168.1.20:8080/p?x=1", &e));
  assert(!e.tls && e.port == 8080 && strcmp(e.host, "192.168.1.20") == 0);
  assert(strcmp(e.path, "/p?x=1") == 0);
  assert(cloud_config::parseUrl("wss://h", &e) && strcmp(e.path, "/") == 0 && e.port == 443);
  assert(!cloud_config::parseUrl("https://h/p", &e));
  assert(!cloud_config::parseUrl("wss://", &e));
  assert(!cloud_config::parseUrl("wss://user@h/p", &e));
  assert(!cloud_config::parseUrl("wss://h:0/p", &e));
  assert(!cloud_config::parseUrl("wss://h:65536/p", &e));
  assert(!cloud_config::parseUrl("wss://h:123456/p", &e));
  assert(!cloud_config::parseUrl("wss://h:/p", &e));
  assert(!cloud_config::parseUrl("wss://h/a b", &e));
  assert(!cloud_config::parseUrl("wss://h/a\r\nX: y", &e));
  assert(!cloud_config::parseUrl("wss://h/a\"b", &e));   // stays JSON/HTML safe
  assert(!cloud_config::parseUrl("wss://h/a\\b", &e));
  assert(!cloud_config::parseUrl("wss://h/<p>", &e));
  assert(!cloud_config::parseUrl("wss://h/\xC3\xA4", &e));
  assert(cloud_config::parseUrl("wss://h/p%20q;v=1", &e));
  assert(!cloud_config::parseUrl("wss://[::1]/p", &e));
  assert(!cloud_config::parseUrl(("wss://h/" + std::string(121, 'a')).c_str(), &e));  // 129 chars
  assert(cloud_config::parseUrl(("wss://h/" + std::string(120, 'a')).c_str(), &e));   // 128 chars

  // Token: header-safe characters only, 1..96.
  assert(cloud_config::tokenValid("zhacp_hometiles_AbC-123_xyz"));
  assert(cloud_config::tokenValid(std::string(96, 'a').c_str()));
  assert(!cloud_config::tokenValid(std::string(97, 'a').c_str()));
  assert(!cloud_config::tokenValid(""));
  assert(!cloud_config::tokenValid(nullptr));
  assert(!cloud_config::tokenValid("abc def"));
  assert(!cloud_config::tokenValid("abc\r\nHost: evil"));
  assert(!cloud_config::tokenValid("abc\"def"));
  return 0;
}
`;

const source = path.join(out, 'codec.cpp');
const binary = path.join(out, process.platform === 'win32' ? 'codec.exe' : 'codec');
fs.writeFileSync(source, cpp);
const compilers = [process.env.CXX, 'clang++', 'g++', 'c++'].filter(Boolean);
const compiler = compilers.find(candidate => {
  const check = spawnSync(candidate, ['--version'], {encoding: 'utf8'});
  return !check.error && check.status === 0;
});
if (!compiler) {
  console.log('SKIP: no C++ compiler for the cloud frame codec test');
  process.exit(0);
}
const compile = spawnSync(compiler,
  ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-I', root, source, '-o', binary],
  {encoding: 'utf8'});
assert.equal(compile.status, 0, `cloud frame codec harness did not compile:\n${compile.stdout}${compile.stderr}`);
const run = spawnSync(binary, [], {encoding: 'utf8'});
assert.equal(run.status, 0, `cloud frame codec vectors failed:\n${run.stdout}${run.stderr}`);
console.log('cloud frame codec and cloud config vectors passed');
