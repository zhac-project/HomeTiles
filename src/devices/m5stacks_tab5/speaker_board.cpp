#include "src/audio/speaker_select.h"

#if defined(DEVICE_M5STACKS_TAB5) && defined(HOMETILES_SPEAKER)

#include "src/devices/m5stacks_tab5/speaker_board.h"

#include <M5Unified.h>

#include "src/audio/codecs/codec_bus.h"

namespace speaker_board {
namespace {

// BSP_SPEAKER_EN: PI4IOE5V6408 at 0x43 (M5.getIOExpander(0)), pin P1.
constexpr uint8_t kAmpExpander = 0;
constexpr uint8_t kAmpPin = 1;
bool g_amp_pin_ready = false;

}  // namespace

void setAmp(bool on) {
  // M5.begin() in the display init sets up the bus and the expanders.
  if (M5.getBoard() != m5::board_t::board_M5Tab5) return;
  auto& expander = M5.getIOExpander(kAmpExpander);
  // Output level first, then drive it, so the line never glitches high.
  expander.digitalWrite(kAmpPin, on);
  if (!g_amp_pin_ready) {
    expander.setDirection(kAmpPin, true);
    expander.setHighImpedance(kAmpPin, false);
    g_amp_pin_ready = true;
  }
}

}  // namespace speaker_board

// codec_bus over M5Unified's internal I2C (HOMETILES_CODEC_BUS_BY_BOARD):
// m5gfx::i2c holds a per-port mutex for each register transfer.
namespace codec_bus {
namespace {

// M5Unified writes the Tab5 codecs at 400 kHz.
constexpr uint32_t kI2cFrequencyHz = 400000;

}  // namespace

esp_err_t attach(uint8_t address, Device* device) {
  if (!device) return ESP_ERR_INVALID_ARG;
  *device = Device{};
  if (M5.getBoard() != m5::board_t::board_M5Tab5) return ESP_ERR_INVALID_STATE;
  if (!M5.In_I2C.scanID(address, kI2cFrequencyHz)) return ESP_ERR_NOT_FOUND;
  device->address = address;
  device->attached = true;
  return ESP_OK;
}

esp_err_t write(const Device& device, uint8_t reg, uint8_t value) {
  if (!device.attached) return ESP_ERR_INVALID_STATE;
  return M5.In_I2C.writeRegister8(device.address, reg, value, kI2cFrequencyHz) ? ESP_OK
                                                                                : ESP_FAIL;
}

esp_err_t read(const Device& device, uint8_t reg, uint8_t* value) {
  if (!device.attached || !value) return ESP_ERR_INVALID_STATE;
  return M5.In_I2C.readRegister(device.address, reg, value, 1, kI2cFrequencyHz) ? ESP_OK
                                                                                : ESP_FAIL;
}

void detach(Device* device) {
  if (device) *device = Device{};
}

}  // namespace codec_bus

#endif  // defined(DEVICE_M5STACKS_TAB5) && defined(HOMETILES_SPEAKER)
