#pragma once

// Minimal ES8388 stereo codec driver for playback (DAC path only), as on the
// M5Stack Tab5. Register sequence from Espressif's esp_codec_dev es8388
// driver, the Tab5 output levels from M5Unified (see PROVENANCE.md).
// Registers go through codec_bus, the board's transport.
//
// The codec runs as I2S slave, single speed, MCLK = 256 x fs from the MCLK
// pin; the mono stream reaches both DAC channels (both I2S slots).
// Not thread-safe: one task (the speaker worker) owns the handle.

#include <stddef.h>
#include <stdint.h>

#include <esp_err.h>

#include "src/audio/codecs/codec_bus.h"

namespace es8388 {

// 7-bit address with CE low (esp_codec_dev ES8388_CODEC_DEFAULT_ADDR 0x20 in
// 8-bit form; M5Stack Tab5).
constexpr uint8_t kDefaultAddress = 0x10;
// MCLK the I2S peripheral must provide: kMclkMultiple x sample rate.
constexpr uint32_t kMclkMultiple = 256;

struct Codec {
  codec_bus::Device dev;
};

// Single speed rates (8 to 48 kHz) at MCLK = 256 x fs.
bool supportsSampleRate(uint32_t sample_rate);

// Attaches the device and reads register 0x00; an answer counts as present.
// On failure the device is detached again.
esp_err_t probe(uint8_t address, Codec* codec);
// Configures 16-bit I2S slave playback on all four outputs and starts the
// DAC, muted until setMute(false).
esp_err_t init(Codec* codec);
// es8388_start() for the DAC: restarts the state machine and powers the DAC
// and outputs. init() does it once; the speaker repeats it whenever the I2S
// output opened and MCLK runs, as esp_codec_dev and M5Unified start the
// codec after their I2S channel.
esp_err_t start(Codec* codec);
// The ES8311 volume scale shared by the speaker core (0 = -95.5 dB,
// 0xBF = 0 dB, 0.5 dB steps), written as the DAC attenuation (0 = 0 dB,
// 0xC0 = -96 dB).
esp_err_t setVolumeRegister(Codec* codec, uint8_t es8311_scale);
esp_err_t setMute(Codec* codec, bool mute);
// Detaches the device.
void release(Codec* codec);

}  // namespace es8388
