#pragma once

// Minimal ES8311 mono codec driver: playback (DAC) and, on boards whose only
// microphone sits on the ES8311 (Guition), the analog MIC1 ADC path.
// Register sequence and clock coefficients come from Espressif's esp-bsp
// es8311 component, the microphone setup from esp_codec_dev (see
// PROVENANCE.md). Registers go through codec_bus, the board's transport.
//
// The codec runs as I2S slave with MCLK from the MCLK pin at 256 x fs; DAC
// and ADC share one clock setup, so the rate follows whichever direction
// the speaker worker opened last.
// Not thread-safe: one task (the speaker worker) owns the handle.

#include <stddef.h>
#include <stdint.h>

#include <esp_err.h>

#include "src/audio/codecs/codec_bus.h"

namespace es8311 {

// 7-bit address with CE low (Waveshare and Guition boards: 0x18).
constexpr uint8_t kDefaultAddress = 0x18;
// MCLK the I2S peripheral must provide: kMclkMultiple x sample rate.
constexpr uint32_t kMclkMultiple = 256;

struct Codec {
  codec_bus::Device dev;
};

// True for the sample rates the clock table covers at 256 x fs.
bool supportsSampleRate(uint32_t sample_rate);

// Attaches the device and checks the chip ID (0xFD/0xFE = 0x83/0x11).
// On failure the device is detached again.
esp_err_t probe(uint8_t address, Codec* codec);
// Resets the codec and configures 16-bit I2S slave playback at sample_rate.
esp_err_t init(Codec* codec, uint32_t sample_rate);
// Reprograms the clock dividers for a new sample rate (MCLK = 256 x rate).
esp_err_t setSampleRate(Codec* codec, uint32_t sample_rate);
// DAC digital volume register 0x32: 0 = -95.5 dB, 0xBF = 0 dB, 0.5 dB steps.
esp_err_t setVolumeRegister(Codec* codec, uint8_t value);
esp_err_t setMute(Codec* codec, bool mute);

// ADC digital gain (register 0x16 scale): 0..7 = 0..42 dB in 6 dB steps,
// on top of the fixed 30 dB analog PGA.
constexpr uint8_t kMaxMicScale = 7;
// Analog MIC1 in, 30 dB PGA, ADC volume 0 dB, ADC data on both I2S slots,
// and the digital gain scale. Needs init() before; keeps the DAC as it is.
esp_err_t startMicrophone(Codec* codec, uint8_t scale);
esp_err_t setMicScale(Codec* codec, uint8_t scale);
// The digital gain scale for the speaker's stored mic gain, given in tenths
// of a dB (speaker::micGainTenthsDb()): the default 30 dB setting gives
// 24 dB, the value Guition's own demo uses on these boards; each 6 dB of
// setting above 6 dB adds a step.
inline uint8_t micScaleForTenthsDb(uint16_t tenths_db) {
  if (tenths_db < 60) return 0;
  const uint16_t scale = static_cast<uint16_t>((tenths_db - 60) / 60);
  return static_cast<uint8_t>(scale > kMaxMicScale ? kMaxMicScale : scale);
}

// Detaches the device.
void release(Codec* codec);

}  // namespace es8311
