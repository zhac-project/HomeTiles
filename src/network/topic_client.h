#ifndef TOPIC_CLIENT_H
#define TOPIC_CLIENT_H

#include <Arduino.h>
#include <Client.h>
#include <functional>

#include "src/network/vendor/pubsubclient/PubSubClient.h"

// Transport under the MQTT topic layer. HomeTiles speaks topics (publish,
// exact subscriptions, retained messages, a last will); a TopicClient carries
// them over an MQTT broker (PubSubClientAdapter) or over ZHAC Cloud
// (CloudTopicClient). The surface is exactly the part of PubSubClient that
// HomeTiles uses, so the worker's call sites stay unchanged. After init()
// only the MQTT worker task calls it.
class TopicClient {
 public:
  using Callback = std::function<void(char*, uint8_t*, unsigned int)>;
  virtual ~TopicClient() = default;

  virtual void setClient(Client& client) = 0;
  virtual void setServer(const char* host, uint16_t port) = 0;
  virtual void setCallback(Callback callback) = 0;
  virtual bool setBufferSize(uint16_t size) = 0;
  virtual uint16_t getBufferSize() = 0;
  virtual uint16_t getReceiveBufferSize() const = 0;
  virtual bool bufferInExternalRam() = 0;
  virtual bool connect(const char* id, const char* user, const char* pass,
                       const char* will_topic, uint8_t will_qos,
                       bool will_retain, const char* will_message) = 0;
  virtual bool connected() = 0;
  virtual int state() = 0;
  virtual bool loop() = 0;
  virtual bool publish(const char* topic, const char* payload,
                       bool retained) = 0;
  virtual bool publish(const char* topic, const uint8_t* payload,
                       unsigned int length, bool retained) = 0;
  virtual bool beginPublish(const char* topic, unsigned int length,
                            bool retained) = 0;
  virtual size_t write(uint8_t byte) = 0;
  virtual size_t write(const uint8_t* data, size_t size) = 0;
  virtual int endPublish() = 0;
  virtual bool subscribe(const char* topic) = 0;
  virtual bool unsubscribe(const char* topic) = 0;
  virtual void disconnect() = 0;
  // Retain flag of the message being delivered; valid inside the callback.
  virtual bool lastPublishRetained() const = 0;
};

// The upstream transport: every call goes to the vendored PubSubClient.
class PubSubClientAdapter final : public TopicClient {
 public:
  void setClient(Client& client) override { client_.setClient(client); }
  void setServer(const char* host, uint16_t port) override {
    client_.setServer(host, port);
  }
  void setCallback(Callback callback) override {
    client_.setCallback(callback);
  }
  bool setBufferSize(uint16_t size) override {
    return client_.setBufferSize(size);
  }
  uint16_t getBufferSize() override { return client_.getBufferSize(); }
  uint16_t getReceiveBufferSize() const override {
    return client_.getReceiveBufferSize();
  }
  bool bufferInExternalRam() override { return client_.bufferInExternalRam(); }
  bool connect(const char* id, const char* user, const char* pass,
               const char* will_topic, uint8_t will_qos, bool will_retain,
               const char* will_message) override {
    return client_.connect(id, user, pass, will_topic, will_qos, will_retain,
                           will_message);
  }
  bool connected() override { return client_.connected(); }
  int state() override { return client_.state(); }
  bool loop() override { return client_.loop(); }
  bool publish(const char* topic, const char* payload, bool retained) override {
    return client_.publish(topic, payload, retained);
  }
  bool publish(const char* topic, const uint8_t* payload, unsigned int length,
               bool retained) override {
    return client_.publish(topic, payload, length, retained);
  }
  bool beginPublish(const char* topic, unsigned int length,
                    bool retained) override {
    return client_.beginPublish(topic, length, retained);
  }
  size_t write(uint8_t byte) override { return client_.write(byte); }
  size_t write(const uint8_t* data, size_t size) override {
    return client_.write(data, size);
  }
  int endPublish() override { return client_.endPublish(); }
  bool subscribe(const char* topic) override { return client_.subscribe(topic); }
  bool unsubscribe(const char* topic) override {
    return client_.unsubscribe(topic);
  }
  void disconnect() override { client_.disconnect(); }
  bool lastPublishRetained() const override {
    return client_.lastPublishRetained();
  }

 private:
  PubSubClient client_;
};

// Forwards to the transport the worker selected in init() or on a
// reconfigure, so the transport can change at runtime without touching the
// call sites. Selection happens only while the worker is the sole user.
class SelectedTopicClient final : public TopicClient {
 public:
  explicit SelectedTopicClient(TopicClient& initial) : active_(&initial) {}
  void select(TopicClient& transport) { active_ = &transport; }
  bool isSelected(const TopicClient& transport) const {
    return active_ == &transport;
  }

  void setClient(Client& client) override { active_->setClient(client); }
  void setServer(const char* host, uint16_t port) override {
    active_->setServer(host, port);
  }
  void setCallback(Callback callback) override {
    active_->setCallback(callback);
  }
  bool setBufferSize(uint16_t size) override {
    return active_->setBufferSize(size);
  }
  uint16_t getBufferSize() override { return active_->getBufferSize(); }
  uint16_t getReceiveBufferSize() const override {
    return active_->getReceiveBufferSize();
  }
  bool bufferInExternalRam() override { return active_->bufferInExternalRam(); }
  bool connect(const char* id, const char* user, const char* pass,
               const char* will_topic, uint8_t will_qos, bool will_retain,
               const char* will_message) override {
    return active_->connect(id, user, pass, will_topic, will_qos, will_retain,
                            will_message);
  }
  bool connected() override { return active_->connected(); }
  int state() override { return active_->state(); }
  bool loop() override { return active_->loop(); }
  bool publish(const char* topic, const char* payload, bool retained) override {
    return active_->publish(topic, payload, retained);
  }
  bool publish(const char* topic, const uint8_t* payload, unsigned int length,
               bool retained) override {
    return active_->publish(topic, payload, length, retained);
  }
  bool beginPublish(const char* topic, unsigned int length,
                    bool retained) override {
    return active_->beginPublish(topic, length, retained);
  }
  size_t write(uint8_t byte) override { return active_->write(byte); }
  size_t write(const uint8_t* data, size_t size) override {
    return active_->write(data, size);
  }
  int endPublish() override { return active_->endPublish(); }
  bool subscribe(const char* topic) override {
    return active_->subscribe(topic);
  }
  bool unsubscribe(const char* topic) override {
    return active_->unsubscribe(topic);
  }
  void disconnect() override { active_->disconnect(); }
  bool lastPublishRetained() const override {
    return active_->lastPublishRetained();
  }

 private:
  TopicClient* active_;
};

#endif  // TOPIC_CLIENT_H
