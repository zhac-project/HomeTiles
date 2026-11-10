# ZHAC fork

Current facts about what this fork (`zhac-project/HomeTiles`) adds to upstream
HomeTiles. Upstream state lives in `PROJECT_CONTEXT.md`.

## ZHAC Cloud

- Transport (`src/network/cloud/`): the panel's topics travel over a cloud
  WebSocket instead of MQTT or the Bridge link. The cloud plugin (zhac-tiles)
  answers as the Bridge does; the topic names and payloads are the Bridge's.
  `BridgeTransportClient`'s MQTT side is a `TopicClient` (broker or cloud,
  `transport` setting); a stored Bridge link still takes precedence.
- Remote Web Admin: the cloud opens a tunnel over the same socket
  (`cloud_tunnel.h`); the panel bridges it to its own Web Admin on port 80.
  Connection settings, firmware, files, the Web Admin password and other
  local-only routes answer 403 in a remote session (`localOnly` inside the
  upstream password guards). Every same-origin URL of the Web Admin and the
  login page is relative (the proxy serves it under a path prefix).
- TLS: ESP-IDF's common CA set (`cloud_ca_bundle.cpp`), so the Tab5 image fits.
- Updates check `zhac-project/HomeTiles` releases. The icon file comes from
  upstream's release of the same FW_VERSION (built-in icons unchanged).

## Sunton ESP32-8048S070C (fork-only profile)

- Runs on the Guition S3 code with its own driver; link OK. TLS starved
  internal RAM after hours: PSRAM TLS fallback (`tls_memory.cpp`) and a wake
  resync; hardware soak pending.
