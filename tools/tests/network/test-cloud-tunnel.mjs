// ZHAC Cloud remote Web Admin tunnel: the tunnel ops in the frame codec and
// the stream bookkeeping (ids, reasons, bounded buffers, stream table) that
// the MQTT worker drives. The panel's half of zhac-tiles docs/04 §4.1.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const out = path.join(root, 'build/tests/cloud-tunnel');
fs.mkdirSync(out, {recursive: true});

const cpp = String.raw`
#include <cassert>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include "src/network/cloud/cloud_frame.h"
#include "src/network/cloud/cloud_tunnel.h"

using namespace cloud_tunnel;

static int grows = 0;
static bool refuse_growth = false;
static void* grow(void* old_block, size_t bytes) {
  if (refuse_growth) return nullptr;
  ++grows;
  return realloc(old_block, bytes);
}
static void release_block(void* block) { free(block); }

int main() {
  // --- tunnel ops in the codec ---------------------------------------------
  using namespace cloud_frame;
  assert(knownOp(kOpTunOpen) && knownOp(kOpTunData) && knownOp(kOpTunClose));
  assert(!knownOp(0x13) && !knownOp(0x0F));
  uint8_t buf[64];
  const size_t head = encodeHead(kOpTunClose, true, "7", 4, buf, sizeof(buf));
  assert(head == 5 && buf[0] == 0x12 && buf[1] == 0);  // retain only for PUB/WILL
  memcpy(buf + head, "done", 4);
  Frame f{};
  assert(decode(buf, head + 4, &f) && f.op == kOpTunClose && f.payload_len == 4);
  const uint8_t open_frame[] = {0x10, 0x00, 0x00, 0x05, '6', '5', '5', '3', '5'};
  assert(decode(open_frame, sizeof(open_frame), &f) && f.op == kOpTunOpen);
  assert(parseStreamId(f.topic, f.topic_len) == 65535);

  // --- stream ids ------------------------------------------------------------
  assert(parseStreamId("1", 1) == 1);
  assert(parseStreamId("42", 2) == 42);
  assert(parseStreamId("0", 1) == 0);
  assert(parseStreamId("07", 2) == 0);
  assert(parseStreamId("65536", 5) == 0);
  assert(parseStreamId("123456", 6) == 0);
  assert(parseStreamId("-1", 2) == 0);
  assert(parseStreamId("1a", 2) == 0);
  assert(parseStreamId("", 0) == 0);
  assert(parseStreamId(nullptr, 3) == 0);
  char topic[6];
  for (uint32_t id : {1u, 9u, 10u, 999u, 65535u}) {
    formatStreamId(static_cast<uint16_t>(id), topic);
    assert(parseStreamId(topic, strlen(topic)) == id);
  }

  // --- byte queue: FIFO, compaction, hard cap -------------------------------
  ByteQueue q;
  std::string data(10000, 'x');
  for (size_t i = 0; i < data.size(); ++i) data[i] = static_cast<char>('a' + i % 26);
  assert(q.append(reinterpret_cast<const uint8_t*>(data.data()), data.size(), grow));
  assert(q.length == 10000 && memcmp(q.front(), data.data(), 10000) == 0);
  q.consume(9000);
  assert(q.length == 1000 && memcmp(q.front(), data.data() + 9000, 1000) == 0);
  const size_t capacity = q.capacity;
  const int grows_before = grows;
  assert(q.append(reinterpret_cast<const uint8_t*>(data.data()), capacity - 1000, grow));
  assert(grows == grows_before && q.head == 0);  // compacted instead of growing
  assert(memcmp(q.front(), data.data() + 9000, 1000) == 0);
  q.consume(q.length);
  assert(q.length == 0 && q.head == 0);

  std::vector<uint8_t> big(kMaxBuffered, 7);
  assert(q.append(big.data(), big.size(), grow));
  assert(q.capacity == kMaxBuffered && q.length == kMaxBuffered);
  assert(!q.append(big.data(), 1, grow));          // the cap holds
  assert(q.reserve(1, grow) == nullptr);
  q.consume(1);
  assert(q.reserve(1, grow) != nullptr);           // room again after reading
  q.release(release_block);
  assert(q.data == nullptr && q.capacity == 0 && q.length == 0);

  refuse_growth = true;
  assert(!q.append(big.data(), 10, grow) && q.length == 0);  // allocator failure
  refuse_growth = false;

  // --- stream table: two streams, busy, duplicate ---------------------------
  Table t;
  Stream* s = nullptr;
  assert(t.open(3, 1000, &s) == OpenResult::Opened && s->id == 3 && s->last_activity_ms == 1000);
  Stream* second = nullptr;
  assert(t.open(4, 1000, &second) == OpenResult::Opened && second != s);
  Stream* third = nullptr;
  assert(t.open(5, 1000, &third) == OpenResult::Busy && third == nullptr);
  Stream* again = nullptr;
  assert(t.open(3, 1000, &again) == OpenResult::Duplicate && again == s);
  assert(t.active() == 2 && t.find(4) == second && t.find(5) == nullptr && t.find(0) == nullptr);

  // Frame splitting: at most 16 KiB per TUN_DATA.
  assert(s->to_cloud.append(big.data(), 40000, grow));
  assert(nextFrameBytes(*s) == kMaxDataFrame);
  s->to_cloud.consume(kMaxDataFrame);
  s->to_cloud.consume(kMaxDataFrame);
  assert(nextFrameBytes(*s) == 40000 - 2 * kMaxDataFrame);
  assert(!done(*s));
  s->eof = true;
  assert(!done(*s));  // flush what is buffered before "done"
  s->to_cloud.consume(s->to_cloud.length);
  assert(done(*s));

  // Idle timeout, including across the millis() wrap.
  assert(!idle(*s, 1000 + kIdleTimeoutMs - 1) && idle(*s, 1000 + kIdleTimeoutMs));
  s->last_activity_ms = 0xFFFFF000u;
  assert(!idle(*s, 0x00000100u) && idle(*s, 0xFFFFF000u + kIdleTimeoutMs));

  Table::release(*s, release_block);
  assert(t.active() == 1 && t.find(3) == nullptr);
  assert(t.open(5, 2000, &third) == OpenResult::Opened && t.active() == 2);
  Table::release(*second, release_block);
  Table::release(*third, release_block);
  assert(t.active() == 0);

  // Reason codes stay the protocol's ASCII words.
  assert(std::string(kReasonDone) == "done" && std::string(kReasonBusy) == "busy");
  assert(std::string(kReasonRefused) == "refused" && std::string(kReasonTimeout) == "timeout");
  assert(std::string(kReasonError) == "error");
  return 0;
}
`;

const source = path.join(out, 'tunnel.cpp');
const binary = path.join(out, process.platform === 'win32' ? 'tunnel.exe' : 'tunnel');
fs.writeFileSync(source, cpp);
const compilers = [process.env.CXX, 'clang++', 'g++', 'c++'].filter(Boolean);
const compiler = compilers.find(candidate => {
  const check = spawnSync(candidate, ['--version'], {encoding: 'utf8'});
  return !check.error && check.status === 0;
});
if (!compiler) {
  console.log('SKIP: no C++ compiler for the cloud tunnel test');
  process.exit(0);
}
const compile = spawnSync(compiler,
  ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-I', root, source, '-o', binary],
  {encoding: 'utf8'});
assert.equal(compile.status, 0, `cloud tunnel harness did not compile:\n${compile.stdout}${compile.stderr}`);
const run = spawnSync(binary, [], {encoding: 'utf8'});
assert.equal(run.status, 0, `cloud tunnel vectors failed:\n${run.stdout}${run.stderr}`);
console.log('cloud tunnel ops, stream ids, buffers and stream table passed');
