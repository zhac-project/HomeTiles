#ifndef CLOUD_TOPIC_CLIENT_H
#define CLOUD_TOPIC_CLIENT_H

#include "src/network/cloud/cloud_config.h"
#include "src/network/topic_client.h"

class CloudWebSocket;  // Wraps the vendored WebSocketsClient (see .cpp).

// ZHAC Cloud transport: the same topics as MQTT over one WebSocket
// (subprotocol hometiles.v1, frames in cloud_frame.h), authenticated with the
// panel token at the handshake. Like PubSubClient it is polled by the MQTT
// worker, which is its only caller after init(); inbound messages reach the
// callback on the worker, inside loop().
class CloudTopicClient final : public TopicClient {
 public:
  // Why the cloud refused the panel. Drives the long retry and the Web Admin
  // status; cleared when the next connection opens.
  enum class Refusal : uint8_t {
    None,
    Unauthorized,  // HTTP 401 at the handshake: token unknown or revoked.
    TokenRevoked,  // Close 1008 while connected.
    PlanRequired,  // HTTP 402 at the handshake or close 4402.
    Forbidden,     // HTTP 403 at the handshake.
  };

  CloudTopicClient() = default;
  ~CloudTopicClient() override;
  CloudTopicClient(const CloudTopicClient&) = delete;
  CloudTopicClient& operator=(const CloudTopicClient&) = delete;

  // Applies cloud_url and cloud_token; false when either is unusable. The
  // token is kept only inside the Authorization header and never logged.
  bool configure(const char* url, const char* token);
  bool configured() const { return configured_; }
  const char* host() const { return endpoint_.host; }
  Refusal refusal() const { return refusal_; }

  // TopicClient. The broker-specific calls are no-ops: the socket, the TLS
  // client and the server address come from configure().
  void setClient(Client&) override {}
  void setServer(const char*, uint16_t) override {}
  void setCallback(Callback callback) override { callback_ = callback; }
  bool setBufferSize(uint16_t size) override;
  uint16_t getBufferSize() override { return buffer_size_; }
  uint16_t getReceiveBufferSize() const override { return receive_size_; }
  bool bufferInExternalRam() override { return true; }
  bool connect(const char* id, const char* user, const char* pass,
               const char* will_topic, uint8_t will_qos, bool will_retain,
               const char* will_message) override;
  bool connected() override;
  int state() override;
  bool loop() override;
  bool publish(const char* topic, const char* payload, bool retained) override;
  bool publish(const char* topic, const uint8_t* payload, unsigned int length,
               bool retained) override;
  bool beginPublish(const char* topic, unsigned int length,
                    bool retained) override;
  size_t write(uint8_t byte) override;
  size_t write(const uint8_t* data, size_t size) override;
  int endPublish() override;
  bool subscribe(const char* topic) override;
  bool unsubscribe(const char* topic) override;
  void disconnect() override;
  bool lastPublishRetained() const override { return last_retained_; }

 private:
  friend class CloudWebSocket;
  enum class Phase : uint8_t { Idle, Opening, Open, Closed };

  void onEvent(int type, uint8_t* payload, size_t length);
  void onClose(uint16_t code);
  void onDisconnected(const uint8_t* reason, size_t length);
  void onFragment(const uint8_t* data, size_t length, bool first, bool last);
  void deliver(uint8_t* data, size_t length);
  bool sendFrame(uint8_t op, bool retain, const char* topic,
                 const uint8_t* payload, size_t length);
  bool reserve(uint8_t*& buffer, size_t& capacity, size_t bytes);
  void resetSession();

  CloudWebSocket* ws_ = nullptr;
  cloud_config::Endpoint endpoint_{};
  bool configured_ = false;
  // "Authorization: Bearer " + token; passed to the handshake only.
  char auth_header_[24 + cloud_config::kTokenMax] = {};
  Callback callback_;

  volatile Phase phase_ = Phase::Idle;
  int state_ = MQTT_DISCONNECTED;
  Refusal refusal_ = Refusal::None;
  bool last_retained_ = false;

  // Mirrors PubSubClient's sizes: the callback validates each message
  // against getBufferSize(), which grows (4 KiB steps, max 65,535) with the
  // largest message; getReceiveBufferSize() keeps that high-water mark.
  uint16_t buffer_size_ = 1024;
  uint16_t receive_size_ = 0;

  // Outgoing frame in PSRAM with room for the WebSocket header in front, so
  // the library sends it without another copy.
  uint8_t* tx_ = nullptr;
  size_t tx_capacity_ = 0;
  bool streaming_ = false;
  size_t stream_head_ = 0;
  size_t stream_expected_ = 0;
  size_t stream_written_ = 0;

  // Reassembly of a fragmented binary message, in PSRAM.
  uint8_t* fragment_ = nullptr;
  size_t fragment_capacity_ = 0;
  size_t fragment_len_ = 0;
  bool fragment_active_ = false;
};

#endif  // CLOUD_TOPIC_CLIENT_H
