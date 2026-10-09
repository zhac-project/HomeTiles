#include "src/network/tls_memory.h"

#include <esp_heap_caps.h>
#include <mbedtls/platform.h>

#include "src/devices/device_select.h"

namespace TlsMemory {

void* defaultCalloc(size_t count, size_t size) {
  void* ptr = heap_caps_calloc(count, size, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
#if defined(DEVICE_SUNTON_ESP32_8048S070C)
  if (!ptr) ptr = heap_caps_calloc(count, size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
#endif
  return ptr;
}

bool installDefault() {
  return mbedtls_platform_set_calloc_free(defaultCalloc, heap_caps_free) == 0;
}

}  // namespace TlsMemory
