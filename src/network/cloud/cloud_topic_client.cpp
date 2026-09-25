#include "src/network/cloud/cloud_topic_client.h"

#include <errno.h>
#include <esp_heap_caps.h>
#include <fcntl.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <lwip/sockets.h>
#include <new>
#include <unistd.h>

#include "src/network/cloud/cloud_frame.h"
#include "src/network/vendor/arduinowebsockets/WebSocketsClient.h"

// ESP-IDF common-CA bundle that verifies the cloud (cloud_ca_bundle.cpp).
extern const uint8_t kCloudCaBundleStart[] asm("_binary_x509_crt_bundle_start");
extern const uint8_t kCloudCaBundleEnd[] asm("_binary_x509_crt_bundle_end");

namespace {

constexpr char kSubprotocol[] = "hometiles.v1";
// Tells the cloud this panel serves its Web Admin through the tunnel.
constexpr char kFeatureHeader[] = "X-HomeTiles-Features: tunnel";
// Bounded like PubSubClient's socket timeout (TCP + TLS + HTTP upgrade).
constexpr uint32_t kConnectTimeoutMs = 15000;
// Panel pings every 15 s; three unanswered pings close the socket. The cloud
// closes an idle panel after 60 s.
constexpr uint32_t kPingIntervalMs = 15000;
constexpr uint32_t kPongTimeoutMs = 15000;
constexpr uint8_t kMissedPongsBeforeClose = 3;
constexpr size_t kWsReserve = WEBSOCKETS_MAX_HEADER_SIZE;
// mqttCallback checks topic + payload against the reported buffer size, as
// it does for an MQTT PUBLISH packet (fixed header + topic length bytes).
constexpr size_t kCallbackReserve = MQTT_MAX_HEADER_SIZE + 3;
constexpr size_t kBufferStep = 4096;
constexpr size_t kAllocStep = 1024;

bool logDue(uint32_t& last_ms, uint32_t interval_ms) {
  const uint32_t now = millis();
  if (last_ms != 0 && static_cast<uint32_t>(now - last_ms) < interval_ms) {
    return false;
  }
  last_ms = now == 0 ? 1 : now;
  return true;
}

// "HTTP 402" or "WebSocket handshake failed - HTTP 401" -> 402 / 401.
int httpStatusFromReason(const uint8_t* reason, size_t length) {
  if (!reason) return 0;
  static constexpr char kMarker[] = "HTTP ";
  constexpr size_t kMarkerLen = sizeof(kMarker) - 1;
  for (size_t i = 0; i + kMarkerLen + 3 <= length; ++i) {
    if (memcmp(reason + i, kMarker, kMarkerLen) != 0) continue;
    int status = 0;
    for (size_t d = 0; d < 3; ++d) {
      const uint8_t c = reason[i + kMarkerLen + d];
      if (c < '0' || c > '9') return 0;
      status = status * 10 + (c - '0');
    }
    return status;
  }
  return 0;
}

// Tunnel buffers live in PSRAM only; internal RAM stays for Wi-Fi and TLS.
void* tunnelGrow(void* block, size_t bytes) {
  return heap_caps_realloc(block, bytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
}

void tunnelFree(void* block) { heap_caps_free(block); }

// Non-blocking connect to the panel's own Web Admin; -1 when it fails at once.
int openLoopback() {
  const int fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (fd < 0) return -1;
  const int flags = fcntl(fd, F_GETFL, 0);
  fcntl(fd, F_SETFL, flags | O_NONBLOCK);
  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_port = htons(cloud_tunnel::kLocalPort);
  addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (connect(fd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) != 0 &&
      errno != EINPROGRESS) {
    close(fd);
    return -1;
  }
  return fd;
}

// 1 connected, 0 still connecting, -1 failed.
int connectState(int fd) {
  fd_set writable;
  FD_ZERO(&writable);
  FD_SET(fd, &writable);
  timeval no_wait{0, 0};
  const int ready = select(fd + 1, nullptr, &writable, nullptr, &no_wait);
  if (ready == 0) return 0;
  if (ready < 0) return -1;
  int error = 0;
  socklen_t length = sizeof(error);
  if (getsockopt(fd, SOL_SOCKET, SO_ERROR, &error, &length) != 0) return -1;
  return error == 0 ? 1 : -1;
}

bool wouldBlock() { return errno == EAGAIN || errno == EWOULDBLOCK; }

const char* refusalName(CloudTopicClient::Refusal refusal) {
  switch (refusal) {
    case CloudTopicClient::Refusal::Unauthorized: return "unauthorized";
    case CloudTopicClient::Refusal::TokenRevoked: return "token revoked";
    case CloudTopicClient::Refusal::PlanRequired: return "plan required";
    case CloudTopicClient::Refusal::Forbidden: return "forbidden";
    case CloudTopicClient::Refusal::None: break;
  }
  return "none";
}

}  // namespace

// The vendored client (see src/network/vendor/arduinowebsockets/README.md)
// passes close frames to messageReceived(); keep the close code, then let the
// library finish the close.
class CloudWebSocket final : public WebSocketsClient {
 public:
  explicit CloudWebSocket(CloudTopicClient& owner) : owner_(owner) {}
  // A TCP/TLS connect that failed sets this without raising an event.
  bool connectAttemptFailed() const { return _lastConnectionFail != 0; }

 protected:
  void messageReceived(WSclient_t* client, WSopcode_t opcode, uint8_t* payload,
                       size_t length, bool fin) override {
    if (opcode == WSop_close) {
      owner_.onClose(length >= 2 && payload
                         ? static_cast<uint16_t>((payload[0] << 8) | payload[1])
                         : 1005);
      return;
    }
    WebSocketsClient::messageReceived(client, opcode, payload, length, fin);
  }

 private:
  CloudTopicClient& owner_;
};

CloudTopicClient::~CloudTopicClient() {
  closeAllTunnels();
  delete ws_;
  heap_caps_free(tx_);
  heap_caps_free(fragment_);
}

bool CloudTopicClient::configure(const char* url, const char* token) {
  configured_ = false;
  refusal_ = Refusal::None;  // New settings; a stale reason would mislead.
  if (!cloud_config::tokenValid(token) ||
      !cloud_config::parseUrl(url, &endpoint_)) {
    endpoint_.host[0] = '\0';
    return false;
  }
  snprintf(auth_header_, sizeof(auth_header_),
           "Authorization: Bearer %s\r\n%s", token, kFeatureHeader);
  if (!ws_) {
    ws_ = new (std::nothrow) CloudWebSocket(*this);
    if (!ws_) return false;
    ws_->onEvent([this](WStype_t type, uint8_t* payload, size_t length) {
      onEvent(static_cast<int>(type), payload, length);
    });
  }
  configured_ = true;
  return true;
}

bool CloudTopicClient::setBufferSize(uint16_t size) {
  if (size == 0) return false;
  buffer_size_ = size;
  return true;
}

bool CloudTopicClient::connect(const char* id, const char* user,
                               const char* pass, const char* will_topic,
                               uint8_t will_qos, bool will_retain,
                               const char* will_message) {
  (void)id;
  (void)user;
  (void)pass;
  (void)will_qos;
  resetSession();
  if (!configured_ || !ws_) {
    state_ = MQTT_CONNECT_FAILED;
    return false;
  }

  refusal_ = Refusal::None;
  phase_ = Phase::Opening;
  if (endpoint_.tls) {
    ws_->beginSslWithBundle(endpoint_.host, endpoint_.port, endpoint_.path,
                            kCloudCaBundleStart,
                            static_cast<size_t>(kCloudCaBundleEnd -
                                                kCloudCaBundleStart),
                            kSubprotocol);
  } else {
    ws_->begin(endpoint_.host, endpoint_.port, endpoint_.path, kSubprotocol);
  }
  ws_->setExtraHeaders(auth_header_);
  ws_->enableHeartbeat(kPingIntervalMs, kPongTimeoutMs,
                       kMissedPongsBeforeClose);

  // The library connects inside loop(): TCP and TLS block, the HTTP upgrade
  // reply arrives over the following calls.
  const uint32_t started_ms = millis();
  bool timed_out = false;
  while (phase_ == Phase::Opening) {
    ws_->loop();
    if (phase_ != Phase::Opening) break;
    if (ws_->connectAttemptFailed()) {
      phase_ = Phase::Closed;
      break;
    }
    if (static_cast<uint32_t>(millis() - started_ms) >= kConnectTimeoutMs) {
      timed_out = true;
      break;
    }
    vTaskDelay(pdMS_TO_TICKS(2));
  }

  if (phase_ != Phase::Open) {
    ws_->disconnect();
    phase_ = Phase::Idle;
    state_ = timed_out ? MQTT_CONNECTION_TIMEOUT
             : refusal_ == Refusal::Unauthorized ? MQTT_CONNECT_UNAUTHORIZED
                                                 : MQTT_CONNECT_FAILED;
    if (refusal_ != Refusal::None) {
      Serial.printf("[Cloud] Connection refused by %s: %s\n", endpoint_.host,
                    refusalName(refusal_));
    }
    return false;
  }

  // Register the last will right after the socket opens; the cloud publishes
  // it when the socket drops without a clean close.
  const size_t will_len = will_message ? strlen(will_message) : 0;
  if (!will_topic ||
      !sendFrame(cloud_frame::kOpWill, will_retain, will_topic,
                 reinterpret_cast<const uint8_t*>(will_message), will_len)) {
    Serial.println("[Cloud] Could not register the last will");
    ws_->disconnect();
    phase_ = Phase::Idle;
    state_ = MQTT_CONNECT_FAILED;
    return false;
  }
  state_ = MQTT_CONNECTED;
  return true;
}

bool CloudTopicClient::connected() {
  return ws_ && phase_ == Phase::Open && ws_->isConnected();
}

int CloudTopicClient::state() {
  return connected() ? MQTT_CONNECTED : state_;
}

bool CloudTopicClient::loop() {
  if (!ws_ || phase_ != Phase::Open) return false;
  ws_->loop();
  if (phase_ == Phase::Open && ws_->isConnected()) {
    serviceTunnels();
    return true;
  }
  if (phase_ == Phase::Open) phase_ = Phase::Closed;
  closeAllTunnels();
  state_ = MQTT_CONNECTION_LOST;
  return false;
}

bool CloudTopicClient::publish(const char* topic, const char* payload,
                               bool retained) {
  return publish(topic, reinterpret_cast<const uint8_t*>(payload),
                 payload ? strlen(payload) : 0, retained);
}

bool CloudTopicClient::publish(const char* topic, const uint8_t* payload,
                               unsigned int length, bool retained) {
  return sendFrame(cloud_frame::kOpPub, retained, topic, payload, length);
}

bool CloudTopicClient::subscribe(const char* topic) {
  return sendFrame(cloud_frame::kOpSub, false, topic, nullptr, 0);
}

bool CloudTopicClient::unsubscribe(const char* topic) {
  return sendFrame(cloud_frame::kOpUnsub, false, topic, nullptr, 0);
}

// Streams collect into one frame of the announced length, sent as one binary
// message by endPublish().
bool CloudTopicClient::beginPublish(const char* topic, unsigned int length,
                                    bool retained) {
  if (!connected() || streaming_ || !topic ||
      length > cloud_frame::kMaxPayloadBytes) {
    return false;
  }
  const size_t topic_len = strnlen(topic, cloud_frame::kMaxTopicBytes + 1);
  if (!reserve(tx_, tx_capacity_,
               kWsReserve + cloud_frame::kHeaderBytes + topic_len + length)) {
    return false;
  }
  const size_t head =
      cloud_frame::encodeHead(cloud_frame::kOpPub, retained, topic, length,
                              tx_ + kWsReserve, tx_capacity_ - kWsReserve);
  if (!head) return false;
  stream_head_ = head;
  stream_expected_ = length;
  stream_written_ = 0;
  streaming_ = true;
  return true;
}

size_t CloudTopicClient::write(uint8_t byte) { return write(&byte, 1); }

size_t CloudTopicClient::write(const uint8_t* data, size_t size) {
  if (!streaming_ || !data || size > stream_expected_ - stream_written_) {
    return 0;
  }
  memcpy(tx_ + kWsReserve + stream_head_ + stream_written_, data, size);
  stream_written_ += size;
  return size;
}

int CloudTopicClient::endPublish() {
  if (!streaming_) return 0;
  streaming_ = false;
  if (stream_written_ != stream_expected_ || !connected()) return 0;
  return ws_->sendBIN(tx_, stream_head_ + stream_expected_, true) ? 1 : 0;
}

void CloudTopicClient::disconnect() {
  // A clean close (1000): the cloud does not publish the last will, exactly
  // like an MQTT DISCONNECT.
  if (ws_) ws_->disconnect();
  resetSession();
  phase_ = Phase::Idle;
  state_ = MQTT_DISCONNECTED;
}

bool CloudTopicClient::sendFrame(uint8_t op, bool retain, const char* topic,
                                 const uint8_t* payload, size_t length) {
  if (!connected() || streaming_ || !topic ||
      length > cloud_frame::kMaxPayloadBytes || (!payload && length != 0)) {
    return false;
  }
  const size_t topic_len = strnlen(topic, cloud_frame::kMaxTopicBytes + 1);
  if (!reserve(tx_, tx_capacity_,
               kWsReserve + cloud_frame::kHeaderBytes + topic_len + length)) {
    return false;
  }
  const size_t head = cloud_frame::encodeHead(
      op, retain, topic, length, tx_ + kWsReserve, tx_capacity_ - kWsReserve);
  if (!head) return false;
  if (length) memcpy(tx_ + kWsReserve + head, payload, length);
  // headerToPayload: the library writes its header into the reserved bytes.
  return ws_->sendBIN(tx_, head + length, true);
}

bool CloudTopicClient::reserve(uint8_t*& buffer, size_t& capacity,
                               size_t bytes) {
  if (bytes <= capacity) return true;
  if (bytes > kWsReserve + cloud_frame::kMaxFrameBytes + 1) return false;
  const size_t wanted = (bytes + kAllocStep - 1) / kAllocStep * kAllocStep;
  void* grown = heap_caps_realloc(buffer, wanted,
                                  MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  if (!grown) grown = heap_caps_realloc(buffer, wanted, MALLOC_CAP_8BIT);
  if (!grown) {
    static uint32_t last_log_ms = 0;
    if (logDue(last_log_ms, 10000)) {
      Serial.printf("[Cloud] Buffer allocation failed (%u bytes)\n",
                    static_cast<unsigned>(wanted));
    }
    return false;
  }
  buffer = static_cast<uint8_t*>(grown);
  capacity = wanted;
  return true;
}

void CloudTopicClient::resetSession() {
  closeAllTunnels();
  streaming_ = false;
  stream_written_ = 0;
  stream_expected_ = 0;
  fragment_active_ = false;
  fragment_len_ = 0;
  last_retained_ = false;
}

void CloudTopicClient::onEvent(int type, uint8_t* payload, size_t length) {
  switch (static_cast<WStype_t>(type)) {
    case WStype_CONNECTED:
      if (phase_ == Phase::Opening) phase_ = Phase::Open;
      break;
    case WStype_DISCONNECTED:
      onDisconnected(payload, length);
      break;
    case WStype_BIN:
      fragment_active_ = false;
      deliver(payload, length);
      break;
    case WStype_FRAGMENT_BIN_START:
      onFragment(payload, length, true, false);
      break;
    case WStype_FRAGMENT:
      onFragment(payload, length, false, false);
      break;
    case WStype_FRAGMENT_FIN:
      onFragment(payload, length, false, true);
      break;
    case WStype_TEXT:
    case WStype_FRAGMENT_TEXT_START: {
      // hometiles.v1 is binary only; a text continuation is ignored too
      // because no binary reassembly is active.
      fragment_active_ = false;
      static uint32_t last_log_ms = 0;
      if (logDue(last_log_ms, 60000)) {
        Serial.println("[Cloud] Ignored a text message");
      }
      break;
    }
    default:
      break;
  }
}

void CloudTopicClient::onClose(uint16_t code) {
  if (code == 1008) {
    refusal_ = Refusal::TokenRevoked;
  } else if (code == 4402) {
    refusal_ = Refusal::PlanRequired;
  }
  Serial.printf("[Cloud] Closed by the cloud (code %u)\n",
                static_cast<unsigned>(code));
}

void CloudTopicClient::onDisconnected(const uint8_t* reason, size_t length) {
  const int status = httpStatusFromReason(reason, length);
  if (status == 401) {
    refusal_ = Refusal::Unauthorized;
  } else if (status == 402) {
    refusal_ = Refusal::PlanRequired;
  } else if (status == 403) {
    refusal_ = Refusal::Forbidden;
  } else if (status != 0) {
    static uint32_t last_log_ms = 0;
    if (logDue(last_log_ms, 60000)) {
      Serial.printf("[Cloud] Handshake answered HTTP %d\n", status);
    }
  }
  if (phase_ == Phase::Opening || phase_ == Phase::Open) {
    phase_ = Phase::Closed;
  }
  fragment_active_ = false;
  closeAllTunnels();
}

void CloudTopicClient::onFragment(const uint8_t* data, size_t length,
                                  bool first, bool last) {
  if (first) {
    fragment_active_ = true;
    fragment_len_ = 0;
  }
  if (!fragment_active_) return;
  if (length > cloud_frame::kMaxFrameBytes - fragment_len_ ||
      !reserve(fragment_, fragment_capacity_, fragment_len_ + length + 1)) {
    fragment_active_ = false;
    static uint32_t last_log_ms = 0;
    if (logDue(last_log_ms, 60000)) {
      Serial.println("[Cloud] Dropped an oversized fragmented message");
    }
    return;
  }
  if (length) memcpy(fragment_ + fragment_len_, data, length);
  fragment_len_ += length;
  if (!last) return;
  fragment_active_ = false;
  deliver(fragment_, fragment_len_);
}

void CloudTopicClient::deliver(uint8_t* data, size_t length) {
  static uint32_t last_drop_log_ms = 0;
  cloud_frame::Frame frame{};
  if (!cloud_frame::decode(data, length, &frame)) {
    if (logDue(last_drop_log_ms, 10000)) {
      Serial.printf("[Cloud] Dropped a malformed frame (%u bytes)\n",
                    static_cast<unsigned>(length));
    }
    return;
  }
  if (frame.op == cloud_frame::kOpErr) {
    static uint32_t last_err_log_ms = 0;
    if (logDue(last_err_log_ms, 10000)) {
      const int text_len =
          static_cast<int>(frame.payload_len > 120 ? 120 : frame.payload_len);
      Serial.printf("[Cloud] Cloud reported %.*s: %.*s\n",
                    static_cast<int>(frame.topic_len), frame.topic, text_len,
                    reinterpret_cast<const char*>(frame.payload));
    }
    return;
  }
  if (frame.op == cloud_frame::kOpTunOpen ||
      frame.op == cloud_frame::kOpTunData ||
      frame.op == cloud_frame::kOpTunClose) {
    onTunnelFrame(frame);
    return;
  }
  if (frame.op != cloud_frame::kOpPub) {
    if (logDue(last_drop_log_ms, 10000)) {
      Serial.printf("[Cloud] Dropped a frame with op 0x%02X\n", frame.op);
    }
    return;
  }

  const size_t needed = frame.topic_len + frame.payload_len + kCallbackReserve;
  if (needed > UINT16_MAX) {
    if (logDue(last_drop_log_ms, 10000)) {
      Serial.printf("[Cloud] Dropped a %u-byte message above the topic buffer\n",
                    static_cast<unsigned>(length));
    }
    return;
  }
  if (needed > buffer_size_) {
    size_t grown = (needed + kBufferStep - 1) / kBufferStep * kBufferStep;
    if (grown > UINT16_MAX) grown = UINT16_MAX;
    buffer_size_ = static_cast<uint16_t>(grown);
    if (buffer_size_ > receive_size_) receive_size_ = buffer_size_;
  }

  // NUL-terminate the topic in place: move it one byte down into the header
  // (PubSubClient does the same inside its packet buffer).
  char* topic = reinterpret_cast<char*>(data + cloud_frame::kHeaderBytes - 1);
  memmove(topic, frame.topic, frame.topic_len);
  topic[frame.topic_len] = '\0';
  uint8_t* payload = data + cloud_frame::kHeaderBytes + frame.topic_len;
  last_retained_ = frame.retain;
  if (callback_) {
    callback_(topic, payload, static_cast<unsigned int>(frame.payload_len));
  }
  last_retained_ = false;
}

// --- Remote Web Admin tunnel (cloud_tunnel.h, zhac-tiles docs/04 §4.1) -------
// Everything below runs on the MQTT worker: frames arrive through deliver()
// inside ws_->loop(), and loop() services the loopback sockets once per pass.

bool CloudTopicClient::sendTunnelFrame(uint8_t op, uint16_t id,
                                       const uint8_t* payload, size_t length) {
  char topic[6];
  cloud_tunnel::formatStreamId(id, topic);
  return sendFrame(op, false, topic, payload, length);
}

void CloudTopicClient::onTunnelFrame(const cloud_frame::Frame& frame) {
  const uint16_t id = cloud_tunnel::parseStreamId(frame.topic, frame.topic_len);
  if (id == 0) {
    static uint32_t last_log_ms = 0;
    if (logDue(last_log_ms, 10000)) {
      Serial.printf("[Cloud] Dropped a tunnel frame without a stream id (op 0x%02X)\n",
                    frame.op);
    }
    return;
  }
  const uint32_t now_ms = millis();
  if (frame.op == cloud_frame::kOpTunOpen) {
    cloud_tunnel::Stream* stream = nullptr;
    switch (tunnels_.open(id, now_ms, &stream)) {
      case cloud_tunnel::OpenResult::Busy: {
        const char* reason = cloud_tunnel::kReasonBusy;
        sendTunnelFrame(cloud_frame::kOpTunClose, id,
                        reinterpret_cast<const uint8_t*>(reason), strlen(reason));
        return;
      }
      case cloud_tunnel::OpenResult::Duplicate:
        closeTunnel(*stream, cloud_tunnel::kReasonError);
        return;
      case cloud_tunnel::OpenResult::Opened:
        break;
    }
    stream->fd = openLoopback();
    if (stream->fd < 0) closeTunnel(*stream, cloud_tunnel::kReasonRefused);
    return;
  }

  cloud_tunnel::Stream* stream = tunnels_.find(id);
  if (frame.op == cloud_frame::kOpTunClose) {
    if (stream) closeTunnel(*stream, nullptr);  // The cloud ended it.
    return;
  }
  // TUN_DATA: request bytes for the web server.
  if (!stream) {
    const char* reason = cloud_tunnel::kReasonError;
    sendTunnelFrame(cloud_frame::kOpTunClose, id,
                    reinterpret_cast<const uint8_t*>(reason), strlen(reason));
    return;
  }
  if (!stream->to_server.append(frame.payload, frame.payload_len, tunnelGrow)) {
    closeTunnel(*stream, cloud_tunnel::kReasonError);
    return;
  }
  stream->bytes_in += frame.payload_len;
  stream->last_activity_ms = now_ms;
}

void CloudTopicClient::serviceTunnels() {
  // A camera stream publish owns the send buffer until endPublish(); the
  // tunnel waits for it (its data stays buffered).
  if (streaming_ || tunnels_.active() == 0) return;
  const uint32_t now_ms = millis();
  for (cloud_tunnel::Stream& stream : tunnels_.slots) {
    if (stream.id == 0) continue;

    if (!stream.connected) {
      const int state = connectState(stream.fd);
      if (state < 0) {
        closeTunnel(stream, cloud_tunnel::kReasonRefused);
        continue;
      }
      if (state == 0) {
        if (cloud_tunnel::idle(stream, now_ms)) {
          closeTunnel(stream, cloud_tunnel::kReasonTimeout);
        }
        continue;
      }
      stream.connected = true;
    }

    // Cloud -> web server.
    bool failed = false;
    while (stream.to_server.length != 0) {
      const ssize_t sent = send(stream.fd, stream.to_server.front(),
                                stream.to_server.length, MSG_DONTWAIT);
      if (sent > 0) {
        stream.to_server.consume(static_cast<size_t>(sent));
        stream.last_activity_ms = now_ms;
        continue;
      }
      failed = sent < 0 && !wouldBlock();
      break;
    }

    // Web server -> buffer, eagerly, so the web server finishes its response
    // (it writes from the Arduino loop) without waiting for the internet link.
    while (!failed && !stream.eof &&
           stream.to_cloud.length < cloud_tunnel::kMaxBuffered) {
      size_t want = cloud_tunnel::kMaxBuffered - stream.to_cloud.length;
      if (want > cloud_tunnel::kMaxDataFrame) want = cloud_tunnel::kMaxDataFrame;
      uint8_t* slot = stream.to_cloud.reserve(want, tunnelGrow);
      if (!slot) {
        failed = true;
        break;
      }
      const ssize_t received = recv(stream.fd, slot, want, MSG_DONTWAIT);
      if (received > 0) {
        stream.to_cloud.commit(static_cast<size_t>(received));
        stream.bytes_out += static_cast<uint32_t>(received);
        stream.last_activity_ms = now_ms;
        continue;
      }
      if (received == 0) {
        stream.eof = true;
      } else if (!wouldBlock()) {
        failed = true;
      }
      break;
    }
    if (failed) {
      closeTunnel(stream, cloud_tunnel::kReasonError);
      continue;
    }

    // At most one TUN_DATA frame per stream and pass: tile states interleave.
    const size_t chunk = cloud_tunnel::nextFrameBytes(stream);
    if (chunk != 0 && sendTunnelFrame(cloud_frame::kOpTunData, stream.id,
                                      stream.to_cloud.front(), chunk)) {
      stream.to_cloud.consume(chunk);
      stream.last_activity_ms = now_ms;
    }

    if (cloud_tunnel::done(stream)) {
      closeTunnel(stream, cloud_tunnel::kReasonDone);
    } else if (cloud_tunnel::idle(stream, now_ms)) {
      closeTunnel(stream, cloud_tunnel::kReasonTimeout);
    }
  }
}

void CloudTopicClient::closeTunnel(cloud_tunnel::Stream& stream,
                                   const char* reason) {
  // ponytail: if this send fails (link lost, or a camera stream publish holds
  // the send buffer) the cloud ends the request by its own timeout.
  if (reason) {
    sendTunnelFrame(cloud_frame::kOpTunClose, stream.id,
                    reinterpret_cast<const uint8_t*>(reason), strlen(reason));
  }
  if (stream.fd >= 0) close(stream.fd);
  static uint32_t last_log_ms = 0;
  if (logDue(last_log_ms, 2000)) {
    Serial.printf("[Cloud] Tunnel stream %u closed (%s): %u bytes in, %u bytes out\n",
                  static_cast<unsigned>(stream.id), reason ? reason : "by cloud",
                  static_cast<unsigned>(stream.bytes_in),
                  static_cast<unsigned>(stream.bytes_out));
  }
  cloud_tunnel::Table::release(stream, tunnelFree);
}

void CloudTopicClient::closeAllTunnels() {
  for (cloud_tunnel::Stream& stream : tunnels_.slots) {
    if (stream.id != 0) closeTunnel(stream, nullptr);
  }
}
