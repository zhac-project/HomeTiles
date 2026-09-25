#ifndef CLOUD_FRAME_H
#define CLOUD_FRAME_H

#include <stddef.h>
#include <stdint.h>
#include <string.h>

// ZHAC Cloud panel protocol "hometiles.v1": one binary WebSocket message
// carries exactly one topic operation.
//
//   byte 0     op     0x01 PUB, 0x02 SUB, 0x03 UNSUB, 0x04 WILL,
//                     0x7F ERR (cloud -> panel diagnostics),
//                     0x10 TUN_OPEN (cloud -> panel), 0x11 TUN_DATA,
//                     0x12 TUN_CLOSE (remote Web Admin tunnel, see
//                     cloud_tunnel.h; the topic carries the stream id)
//   byte 1     flags  bit0 = retain (PUB, WILL); other bits reserved
//   bytes 2-3  topic length, uint16 big-endian, 1..1024
//   ...        topic, UTF-8 without NUL
//   ...        payload = the rest of the message, at most 65,535 bytes
//
// Pure functions without Arduino dependencies, exercised by
// tools/tests/network/test-cloud-frame-codec.mjs.
namespace cloud_frame {

constexpr uint8_t kOpPub = 0x01;
constexpr uint8_t kOpSub = 0x02;
constexpr uint8_t kOpUnsub = 0x03;
constexpr uint8_t kOpWill = 0x04;
constexpr uint8_t kOpErr = 0x7F;
constexpr uint8_t kOpTunOpen = 0x10;
constexpr uint8_t kOpTunData = 0x11;
constexpr uint8_t kOpTunClose = 0x12;
constexpr uint8_t kFlagRetain = 0x01;
constexpr size_t kHeaderBytes = 4;
constexpr size_t kMaxTopicBytes = 1024;
constexpr size_t kMaxPayloadBytes = 65535;
constexpr size_t kMaxFrameBytes =
    kHeaderBytes + kMaxTopicBytes + kMaxPayloadBytes;

struct Frame {
  uint8_t op;
  bool retain;
  const char* topic;  // Not NUL-terminated; see topic_len.
  size_t topic_len;
  const uint8_t* payload;
  size_t payload_len;
};

inline bool knownOp(uint8_t op) {
  return op == kOpPub || op == kOpSub || op == kOpUnsub || op == kOpWill ||
         op == kOpErr || op == kOpTunOpen || op == kOpTunData ||
         op == kOpTunClose;
}

// Writes the header and the topic to out and returns their length; the
// payload belongs directly behind them. Returns 0 for an unknown op, an empty
// or oversized topic, an oversized payload, a SUB/UNSUB with a payload, or an
// out buffer that is too small.
inline size_t encodeHead(uint8_t op, bool retain, const char* topic,
                         size_t payload_len, uint8_t* out, size_t out_cap) {
  if (!knownOp(op) || !topic || !out) return 0;
  const size_t topic_len = strnlen(topic, kMaxTopicBytes + 1);
  if (topic_len == 0 || topic_len > kMaxTopicBytes) return 0;
  if (payload_len > kMaxPayloadBytes) return 0;
  if ((op == kOpSub || op == kOpUnsub) && payload_len != 0) return 0;
  const size_t head = kHeaderBytes + topic_len;
  if (out_cap < head) return 0;
  out[0] = op;
  out[1] = retain && (op == kOpPub || op == kOpWill) ? kFlagRetain : 0;
  out[2] = static_cast<uint8_t>(topic_len >> 8);
  out[3] = static_cast<uint8_t>(topic_len & 0xFF);
  memcpy(out + kHeaderBytes, topic, topic_len);
  return head;
}

// Validates one received message and points out at its parts. Rejects short
// or oversized messages, unknown ops, empty or oversized topics, topics that
// run past the message and topics containing NUL.
inline bool decode(const uint8_t* data, size_t len, Frame* out) {
  if (!data || !out || len < kHeaderBytes || len > kMaxFrameBytes) {
    return false;
  }
  if (!knownOp(data[0])) return false;
  const size_t topic_len = (static_cast<size_t>(data[2]) << 8) | data[3];
  if (topic_len == 0 || topic_len > kMaxTopicBytes) return false;
  if (topic_len > len - kHeaderBytes) return false;
  const char* topic = reinterpret_cast<const char*>(data + kHeaderBytes);
  if (memchr(topic, '\0', topic_len) != nullptr) return false;
  const size_t payload_len = len - kHeaderBytes - topic_len;
  if (payload_len > kMaxPayloadBytes) return false;
  out->op = data[0];
  out->retain = (data[1] & kFlagRetain) != 0;
  out->topic = topic;
  out->topic_len = topic_len;
  out->payload = data + kHeaderBytes + topic_len;
  out->payload_len = payload_len;
  return true;
}

}  // namespace cloud_frame

#endif  // CLOUD_FRAME_H
