#include "src/audio/speaker_select.h"

#if defined(HOMETILES_SPEAKER) && !defined(HOMETILES_CODEC_BUS_BY_BOARD)

#include "src/audio/codecs/codec_bus.h"

#include <driver/i2c_master.h>

#include HOMETILES_SPEAKER_BOARD

namespace codec_bus {
namespace {

constexpr int kI2cTimeoutMs = 100;
constexpr uint32_t kI2cSpeedHz = 100000;

i2c_master_dev_handle_t handleOf(const Device& device) {
  return static_cast<i2c_master_dev_handle_t>(device.handle);
}

}  // namespace

esp_err_t attach(uint8_t address, Device* device) {
  if (!device) return ESP_ERR_INVALID_ARG;
  *device = Device{};
  i2c_master_bus_handle_t bus = speaker_board::bus();
  if (!bus) return ESP_ERR_INVALID_STATE;
  i2c_device_config_t config = {};
  config.dev_addr_length = I2C_ADDR_BIT_LEN_7;
  config.device_address = address;
  config.scl_speed_hz = kI2cSpeedHz;
  i2c_master_dev_handle_t dev = nullptr;
  const esp_err_t err = i2c_master_bus_add_device(bus, &config, &dev);
  if (err != ESP_OK) return err;
  device->address = address;
  device->handle = dev;
  device->attached = true;
  return ESP_OK;
}

esp_err_t write(const Device& device, uint8_t reg, uint8_t value) {
  if (!device.attached) return ESP_ERR_INVALID_STATE;
  const uint8_t buffer[2] = {reg, value};
  return i2c_master_transmit(handleOf(device), buffer, sizeof(buffer), kI2cTimeoutMs);
}

esp_err_t read(const Device& device, uint8_t reg, uint8_t* value) {
  if (!device.attached || !value) return ESP_ERR_INVALID_STATE;
  return i2c_master_transmit_receive(handleOf(device), &reg, 1, value, 1, kI2cTimeoutMs);
}

void detach(Device* device) {
  if (!device || !device->attached) return;
  i2c_master_bus_rm_device(handleOf(*device));
  *device = Device{};
}

}  // namespace codec_bus

#endif  // defined(HOMETILES_SPEAKER) && !defined(HOMETILES_CODEC_BUS_BY_BOARD)
