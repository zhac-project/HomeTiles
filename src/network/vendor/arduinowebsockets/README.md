# Vendored arduinoWebSockets (client subset)

Source: https://github.com/Links2004/arduinoWebSockets, release 2.7.2
(Arduino library manager name `WebSockets`, author Markus Sattler).
License: GNU LGPL 2.1, see `LICENSE` in this directory. It covers only the
files in this directory; the rest of HomeTiles stays MIT. The complete source
of the firmware that links this library is this repository, which satisfies
the LGPL relinking requirement for published images.

Only the client files are kept. On ESP32 the core provides libb64 and SHA-1,
so only the libb64 headers are needed.

Changes made for HomeTiles (2026-09-25), all marked `HomeTiles patch`:

- `WebSockets.h`: `WEBSOCKETS_MAX_DATA_SIZE` for ESP32 raised from 15 KiB to
  4 + 1024 + 65,535 bytes, the largest `hometiles.v1` frame. Upstream closed
  the socket (1009) on bridge catalogs and history responses above 15 KiB.
- `WebSockets.cpp`: close frames are passed to `messageReceived()` before the
  disconnect, so `CloudTopicClient` can read the server's close code (1008
  token revoked, 4402 plan required).
- `WebSocketsClient.cpp`: `messageReceived()` ignores close frames (no event),
  keeping the stock event sequence for other users of the class.
