#include "src/network/cloud/cloud_topic_client.h"

#include <esp_heap_caps.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <new>

#include "src/network/cloud/cloud_frame.h"
#include "src/network/vendor/arduinowebsockets/WebSocketsClient.h"

// Mozilla CA bundle embedded in the core's mbedTLS library
// (CONFIG_MBEDTLS_CERTIFICATE_BUNDLE_DEFAULT_FULL), used to verify the cloud.
extern const uint8_t kCloudCaBundleStart[] asm("_binary_x509_crt_bundle_start");
extern const uint8_t kCloudCaBundleEnd[] asm("_binary_x509_crt_bundle_end");

namespace {

constexpr char kSubprotocol[] = "hometiles.v1";
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
  delete ws_;
  heap_caps_free(tx_);
  heap_caps_free(fragment_);
}

bool CloudTopicClient::configure(const char* url, const char* token) {
  configured_ = false;
  if (!cloud_config::tokenValid(token) ||
      !cloud_config::parseUrl(url, &endpoint_)) {
    endpoint_.host[0] = '\0';
    return false;
  }
  snprintf(auth_header_, sizeof(auth_header_), "Authorization: Bearer %s",
           token);
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
  if (phase_ == Phase::Open && ws_->isConnected()) return true;
  if (phase_ == Phase::Open) phase_ = Phase::Closed;
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
