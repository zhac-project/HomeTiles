#pragma once

// Register access to the audio chips (8-bit register, 8-bit value) on the
// board's control bus. Every codec driver talks through this, so a board
// picks the transport once:
//   - default: ESP-IDF i2c_master devices on the bus from
//     speaker_board::bus() (codec_bus.cpp), the bus the display and touch
//     drivers already opened;
//   - HOMETILES_CODEC_BUS_BY_BOARD (speaker_select.h): the board file
//     implements these functions itself (Tab5: M5Unified's internal I2C,
//     which owns that bus).
// Not thread-safe per device: the speaker worker owns the codecs.

#include <stdint.h>

#include <esp_err.h>

namespace codec_bus {

struct Device {
  uint8_t address = 0;
  // Transport handle (an i2c_master device); unused by board transports.
  void* handle = nullptr;
  bool attached = false;
};

// Adds the chip at the 7-bit address. The i2c_master transport does not
// touch the bus here; the drivers read the chip ID to prove it answers.
esp_err_t attach(uint8_t address, Device* device);
esp_err_t write(const Device& device, uint8_t reg, uint8_t value);
esp_err_t read(const Device& device, uint8_t reg, uint8_t* value);
void detach(Device* device);

}  // namespace codec_bus
