#ifndef CLOUD_CONFIG_H
#define CLOUD_CONFIG_H

#include <stddef.h>
#include <stdint.h>
#include <string.h>

// Validation shared by the Web Admin save handler and the ZHAC Cloud
// transport, without Arduino dependencies so the host tests can run it.
namespace cloud_config {

constexpr size_t kUrlMax = 128;    // Characters, without the terminator.
constexpr size_t kTokenMax = 96;
constexpr size_t kHostMax = 127;

struct Endpoint {
  bool tls;
  char host[kHostMax + 1];
  uint16_t port;
  char path[kUrlMax + 1];
};

// wss://host[:port][/path] (default port 443) or ws://host[:port][/path]
// (default port 80, for a cloud on the LAN). The host may contain letters,
// digits, '.' and '-'; the path only RFC 3986 URL characters, so the stored
// URL is safe in JSON, HTML attributes and the HTTP request line. User info,
// IPv6 literals and anything else are rejected.
inline bool parseUrl(const char* url, Endpoint* out) {
  if (!url || !out) return false;
  const size_t len = strnlen(url, kUrlMax + 1);
  if (len == 0 || len > kUrlMax) return false;

  const char* host = url;
  bool tls = false;
  if (strncmp(url, "wss://", 6) == 0) {
    tls = true;
    host += 6;
  } else if (strncmp(url, "ws://", 5) == 0) {
    host += 5;
  } else {
    return false;
  }

  size_t host_len = 0;
  for (; host[host_len] && host[host_len] != ':' && host[host_len] != '/';
       ++host_len) {
    const char c = host[host_len];
    const bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
                    (c >= '0' && c <= '9') || c == '.' || c == '-';
    if (!ok) return false;
  }
  if (host_len == 0 || host_len > kHostMax) return false;

  uint32_t port = tls ? 443U : 80U;
  const char* rest = host + host_len;
  if (*rest == ':') {
    ++rest;
    port = 0;
    size_t digits = 0;
    for (; *rest >= '0' && *rest <= '9'; ++rest) {
      if (++digits > 5) return false;
      port = port * 10U + static_cast<uint32_t>(*rest - '0');
    }
    if (digits == 0 || port == 0 || port > 65535U) return false;
  }
  if (*rest != '\0' && *rest != '/') return false;
  for (const char* c = rest; *c; ++c) {
    const char ch = *c;
    const bool ok = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
                    (ch >= '0' && ch <= '9') ||
                    strchr("-._~:/?#[]@!$&'()*+,;=%", ch) != nullptr;
    if (!ok) return false;
  }

  out->tls = tls;
  memcpy(out->host, host, host_len);
  out->host[host_len] = '\0';
  out->port = static_cast<uint16_t>(port);
  if (*rest) {
    memcpy(out->path, rest, strlen(rest) + 1);
  } else {
    out->path[0] = '/';
    out->path[1] = '\0';
  }
  return true;
}

// Panel tokens are opaque (zhacp_<plugin>_<base64url>). Only characters that
// are safe inside an HTTP header line are accepted.
inline bool tokenValid(const char* token) {
  if (!token) return false;
  const size_t len = strnlen(token, kTokenMax + 1);
  if (len == 0 || len > kTokenMax) return false;
  for (size_t i = 0; i < len; ++i) {
    const char c = token[i];
    const bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
                    (c >= '0' && c <= '9') || c == '-' || c == '_' ||
                    c == '.' || c == '~' || c == '+' || c == '/' || c == '=';
    if (!ok) return false;
  }
  return true;
}

}  // namespace cloud_config

#endif  // CLOUD_CONFIG_H
