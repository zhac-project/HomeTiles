#pragma once

#include <stddef.h>

// The mbedTLS allocator the firmware returns to after every scoped override.
//
// The selected Arduino cores build mbedTLS with CONFIG_MBEDTLS_INTERNAL_MEM_ALLOC.
// A ZHAC Cloud session on the Sunton 8048S070C keeps about 48 KiB of internal
// RAM, and a reconnect needs about 59 KiB at its peak. After hours of uptime
// the S3 no longer had that much, so the handshake failed with
// MBEDTLS_ERR_MPI_ALLOC_FAILED and the panel stayed offline. That board keeps
// TLS in internal RAM while it fits (records in PSRAM compete with the RGB
// scanout and shift the image) and falls back to PSRAM instead of failing.
// Every other board keeps the core's internal-only allocator.
namespace TlsMemory {

void* defaultCalloc(size_t count, size_t size);

// Makes defaultCalloc the allocator of every later mbedTLS allocation.
bool installDefault();

}  // namespace TlsMemory
