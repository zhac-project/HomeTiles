#ifndef CLOUD_TUNNEL_H
#define CLOUD_TUNNEL_H

#include <stddef.h>
#include <stdint.h>
#include <string.h>

// Remote Web Admin tunnel of the ZHAC Cloud transport (hometiles.v1 ops
// 0x10 TUN_OPEN, 0x11 TUN_DATA, 0x12 TUN_CLOSE; zhac-tiles docs/04 §4.1).
//
// The cloud opens a stream, sends one raw HTTP/1.1 request in TUN_DATA frames
// and gets the raw response back the same way. The panel bridges each stream
// to its own Web Admin at 127.0.0.1:80, so the Web Admin handlers stay
// unchanged; a request from 127.0.0.1 is therefore always a remote one.
//
// This header holds the bookkeeping without sockets or Arduino types (stream
// ids, reason codes, bounded byte queues, the stream table); the socket side
// lives in cloud_topic_client.cpp on the MQTT worker. Exercised by
// tools/tests/network/test-cloud-tunnel.mjs.
namespace cloud_tunnel {

constexpr uint8_t kMaxStreams = 2;
// One TUN_DATA payload, so tile-state frames interleave with a large response.
constexpr size_t kMaxDataFrame = 16384;
// Per stream and direction. The panel reads the loopback socket eagerly so its
// web server (which writes from the Arduino loop) never waits for the internet
// link; it stops reading when this much is buffered.
constexpr size_t kMaxBuffered = 256 * 1024;
constexpr uint32_t kIdleTimeoutMs = 30000;
constexpr uint16_t kLocalPort = 80;

// TUN_CLOSE reasons (payload, ASCII).
constexpr char kReasonDone[] = "done";
constexpr char kReasonBusy[] = "busy";
constexpr char kReasonRefused[] = "refused";
constexpr char kReasonTimeout[] = "timeout";
constexpr char kReasonError[] = "error";

// Stream id topic: decimal ASCII 1..65535 without sign, leading zero or other
// characters. Returns 0 for anything else.
inline uint16_t parseStreamId(const char* text, size_t length) {
  if (!text || length == 0 || length > 5 || text[0] == '0') return 0;
  uint32_t value = 0;
  for (size_t i = 0; i < length; ++i) {
    if (text[i] < '0' || text[i] > '9') return 0;
    value = value * 10 + static_cast<uint32_t>(text[i] - '0');
  }
  return value <= 65535 ? static_cast<uint16_t>(value) : 0;
}

// Writes the id as a NUL-terminated topic; out needs 6 bytes.
inline void formatStreamId(uint16_t id, char out[6]) {
  char digits[6];
  size_t n = 0;
  do {
    digits[n++] = static_cast<char>('0' + id % 10);
    id = static_cast<uint16_t>(id / 10);
  } while (id != 0);
  for (size_t i = 0; i < n; ++i) out[i] = digits[n - 1 - i];
  out[n] = '\0';
}

using GrowFn = void* (*)(void* old_block, size_t bytes);
using FreeFn = void (*)(void* block);

// FIFO of bytes with a hard cap. Storage grows on demand through the caller's
// allocator (PSRAM on the panel, malloc in the host test) and is compacted
// before it grows, so a long response streams through a small buffer.
struct ByteQueue {
  uint8_t* data = nullptr;
  size_t capacity = 0;
  size_t head = 0;
  size_t length = 0;

  const uint8_t* front() const { return data + head; }

  // Makes room for `want` more bytes (want <= kMaxBuffered - length) and
  // returns where to write them, or nullptr when the cap or the allocator
  // refuses. Call commit() with the number actually written.
  uint8_t* reserve(size_t want, GrowFn grow) {
    if (want == 0 || want > kMaxBuffered - length) return nullptr;
    if (head + length + want > capacity && head != 0) {
      memmove(data, data + head, length);
      head = 0;
    }
    if (length + want > capacity) {
      size_t grown = capacity ? capacity : 4096;
      while (grown < length + want) grown *= 2;
      if (grown > kMaxBuffered) grown = kMaxBuffered;
      void* block = grow(data, grown);
      if (!block) return nullptr;
      data = static_cast<uint8_t*>(block);
      capacity = grown;
    }
    return data + head + length;
  }

  void commit(size_t written) { length += written; }

  bool append(const uint8_t* bytes, size_t count, GrowFn grow) {
    if (count == 0) return true;
    uint8_t* slot = reserve(count, grow);
    if (!slot) return false;
    memcpy(slot, bytes, count);
    commit(count);
    return true;
  }

  void consume(size_t count) {
    if (count >= length) {
      head = 0;
      length = 0;
      return;
    }
    head += count;
    length -= count;
  }

  void release(FreeFn release_fn) {
    if (data) release_fn(data);
    data = nullptr;
    capacity = 0;
    head = 0;
    length = 0;
  }
};

struct Stream {
  uint16_t id = 0;  // 0 = free slot
  int fd = -1;
  bool connected = false;
  bool eof = false;  // the web server closed its side of the loopback socket
  uint32_t last_activity_ms = 0;
  uint32_t bytes_in = 0;   // cloud -> web server
  uint32_t bytes_out = 0;  // web server -> cloud
  ByteQueue to_server;     // from TUN_DATA, waiting for the loopback socket
  ByteQueue to_cloud;      // read from the loopback socket, waiting for TUN_DATA
};

enum class OpenResult : uint8_t { Opened, Busy, Duplicate };

struct Table {
  Stream slots[kMaxStreams];

  Stream* find(uint16_t id) {
    if (id == 0) return nullptr;
    for (Stream& s : slots) {
      if (s.id == id) return &s;
    }
    return nullptr;
  }

  // Claims a free slot for a TUN_OPEN. The caller answers Busy and Duplicate
  // with TUN_CLOSE (busy / error); on Duplicate the existing stream is kept for
  // the caller to close.
  OpenResult open(uint16_t id, uint32_t now_ms, Stream** out) {
    *out = nullptr;
    if (Stream* existing = find(id)) {
      *out = existing;
      return OpenResult::Duplicate;
    }
    for (Stream& s : slots) {
      if (s.id != 0) continue;
      s = Stream{};
      s.id = id;
      s.last_activity_ms = now_ms;
      *out = &s;
      return OpenResult::Opened;
    }
    return OpenResult::Busy;
  }

  size_t active() const {
    size_t n = 0;
    for (const Stream& s : slots) n += s.id != 0 ? 1 : 0;
    return n;
  }

  // Frees the buffers and the slot; the caller has closed the socket.
  static void release(Stream& s, FreeFn release_fn) {
    s.to_server.release(release_fn);
    s.to_cloud.release(release_fn);
    s = Stream{};
  }
};

inline bool idle(const Stream& s, uint32_t now_ms) {
  return static_cast<uint32_t>(now_ms - s.last_activity_ms) >= kIdleTimeoutMs;
}

// Bytes for the next TUN_DATA frame of this stream (0 = nothing to send).
inline size_t nextFrameBytes(const Stream& s) {
  return s.to_cloud.length < kMaxDataFrame ? s.to_cloud.length : kMaxDataFrame;
}

// The web server finished and everything it sent went to the cloud.
inline bool done(const Stream& s) { return s.eof && s.to_cloud.length == 0; }

}  // namespace cloud_tunnel

#endif  // CLOUD_TUNNEL_H
