#pragma once

#include <Arduino.h>

#include "src/network/cloud/cloud_topic_client.h"
#include "src/network/link/bridge_link_client.h"
#include "src/network/topic_client.h"

// The network worker's message client: MQTT (PubSubClient) as before, or the
// direct Bridge link (docs-dev/bridge-link.md) once the panel has a stored
// Bridge address. Both offer the same calls, so the worker code stays the
// same for either transport. Buffer sizes only apply to MQTT; the link
// reports its fixed receive capacity, which keeps the worker's buffer
// housekeeping at rest.
//
// ZHAC fork: the MQTT side is a TopicClient, the broker (PubSubClient) or
// ZHAC Cloud, selected from the settings (docs-dev/zhac-fork.md). The link
// still takes precedence while a Bridge address is stored.
//
// Like PubSubClient, it is owned by the network worker task after init().
class BridgeTransportClient {
 public:
  bool linkMode() const { return link_mode_; }
  void useLink(bool link) { link_mode_ = link; }
  TopicClient& mqtt() { return mqtt_; }
  BridgeLinkClient& link() { return link_; }
  CloudTopicClient& cloud() { return cloud_; }
  // ZHAC Cloud carries the topics (not the broker, not the link).
  bool cloudMode() const { return !link_mode_ && mqtt_.isSelected(cloud_); }
  // Selects the broker or the cloud for the MQTT side; true when it changed.
  bool useCloud(bool cloud) {
    TopicClient& wanted = cloud ? static_cast<TopicClient&>(cloud_) : broker_;
    if (mqtt_.isSelected(wanted)) return false;
    mqtt_.select(wanted);
    return true;
  }

  void setClient(NetworkClient& client) {
    mqtt_.setClient(client);
    link_.setClient(client);
  }
  void setServer(const char* host, uint16_t port) {
    if (link_mode_) {
      link_.setServer(host, port);
    } else {
      mqtt_.setServer(host, port);
    }
  }
  template <typename Callback>
  void setCallback(Callback callback) {
    mqtt_.setCallback(callback);
    link_.setCallback(callback);
  }
  // Larger messages from the Bridge arrive only over the link, as streams.
  void setStreamReceive(size_t limit, BridgeLinkClient::StreamCallback callback) {
    link_.setStreamReceive(limit, std::move(callback));
  }

  bool connected() { return link_mode_ ? link_.connected() : mqtt_.connected(); }
  void disconnect() {
    if (link_mode_) {
      link_.disconnect();
    } else {
      mqtt_.disconnect();
    }
  }
  bool publish(const char* topic, const uint8_t* payload, unsigned int length, bool retain) {
    return link_mode_ ? link_.publish(topic, payload, length, retain)
                      : mqtt_.publish(topic, payload, length, retain);
  }
  bool publish(const char* topic, const char* payload, bool retain) {
    return link_mode_ ? link_.publish(topic, payload, retain) : mqtt_.publish(topic, payload, retain);
  }
  bool subscribe(const char* topic) {
    return link_mode_ ? link_.subscribe(topic) : mqtt_.subscribe(topic);
  }
  bool unsubscribe(const char* topic) {
    return link_mode_ ? link_.unsubscribe(topic) : mqtt_.unsubscribe(topic);
  }
  bool loop() { return link_mode_ ? link_.loop() : mqtt_.loop(); }
  bool beginPublish(const char* topic, unsigned int length, bool retain) {
    return link_mode_ ? link_.beginPublish(topic, length, retain)
                      : mqtt_.beginPublish(topic, length, retain);
  }
  size_t write(const uint8_t* data, size_t length) {
    return link_mode_ ? link_.write(data, length) : mqtt_.write(data, length);
  }
  int endPublish() { return link_mode_ ? link_.endPublish() : mqtt_.endPublish(); }
  int state() { return link_mode_ ? link_.state() : mqtt_.state(); }
  bool lastPublishRetained() const {
    return link_mode_ ? link_.lastPublishRetained() : mqtt_.lastPublishRetained();
  }

  // The direct link receives into one fixed buffer (kReceiveCapacity).
  bool resizableBuffer() const { return !link_mode_; }
  bool setBufferSize(uint16_t size) { return link_mode_ ? true : mqtt_.setBufferSize(size); }
  uint16_t getBufferSize() {
    return link_mode_ ? BridgeLinkClient::kReceiveCapacity : mqtt_.getBufferSize();
  }
  uint16_t getReceiveBufferSize() const {
    return link_mode_ ? BridgeLinkClient::kReceiveCapacity : mqtt_.getReceiveBufferSize();
  }
  bool bufferInExternalRam() { return link_mode_ ? true : mqtt_.bufferInExternalRam(); }

 private:
  PubSubClientAdapter broker_;
  CloudTopicClient cloud_;
  SelectedTopicClient mqtt_{broker_};
  BridgeLinkClient link_;
  bool link_mode_ = false;
};
