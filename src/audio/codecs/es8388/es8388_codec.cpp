/*
 * SPDX-FileCopyrightText: 2023 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * Adapted for HomeTiles from esp_codec_dev device/es8388/es8388.c: the DAC
 * part of es8388_open() and es8388_start(), the DAC volume and mute, with
 * register access through codec_bus. The output volume of all four outputs
 * follows M5Unified's Tab5 speaker setup (MIT). See PROVENANCE.md.
 */

#include "src/audio/speaker_select.h"

#if defined(HOMETILES_SPEAKER)

#include "src/audio/codecs/es8388/es8388_codec.h"

namespace es8388 {
namespace {

// Register names from esp_codec_dev es8388_reg.h.
constexpr uint8_t kRegControl1 = 0x00;
constexpr uint8_t kRegControl2 = 0x01;
constexpr uint8_t kRegChipPower = 0x02;
constexpr uint8_t kRegAdcPower = 0x03;
constexpr uint8_t kRegDacPower = 0x04;
constexpr uint8_t kRegMasterMode = 0x08;
constexpr uint8_t kRegDacControl1 = 0x17;
constexpr uint8_t kRegDacControl2 = 0x18;
constexpr uint8_t kRegDacControl3 = 0x19;
constexpr uint8_t kRegDacControl4 = 0x1A;
constexpr uint8_t kRegDacControl5 = 0x1B;
constexpr uint8_t kRegDacControl16 = 0x26;
constexpr uint8_t kRegDacControl17 = 0x27;
constexpr uint8_t kRegDacControl20 = 0x2A;
constexpr uint8_t kRegDacControl21 = 0x2B;
constexpr uint8_t kRegDacControl23 = 0x2D;
constexpr uint8_t kRegDacControl24 = 0x2E;
constexpr uint8_t kRegDacControl25 = 0x2F;
constexpr uint8_t kRegDacControl26 = 0x30;
constexpr uint8_t kRegDacControl27 = 0x31;

// DACCONTROL3 bit 2: DAC soft mute.
constexpr uint8_t kDacMuteBit = 1U << 2;
// LOUT1/ROUT1/LOUT2/ROUT2 enabled, DAC powered.
constexpr uint8_t kDacPowerAllOutputs = 0x3C;
// DACCONTROL24-27 output volume: 0x1E = 0 dB, 0x21 = +4.5 dB (M5Unified's
// Tab5 setting on all four outputs).
constexpr uint8_t kOutputVolume = 0x21;
// DACCONTROL4/5 attenuation range: 0 = 0 dB .. 0xC0 = -96 dB.
constexpr uint8_t kMaxAttenuation = 0xC0;
constexpr uint8_t kEs8311ZeroDb = 0xBF;

esp_err_t writeReg(Codec* codec, uint8_t reg, uint8_t value) {
  return codec_bus::write(codec->dev, reg, value);
}

esp_err_t readReg(Codec* codec, uint8_t reg, uint8_t* value) {
  return codec_bus::read(codec->dev, reg, value);
}

#define ES8388_TRY(expr)              \
  do {                                \
    const esp_err_t err_ = (expr);    \
    if (err_ != ESP_OK) return err_;  \
  } while (0)

}  // namespace

bool supportsSampleRate(uint32_t sample_rate) {
  switch (sample_rate) {
    case 8000:
    case 11025:
    case 12000:
    case 16000:
    case 22050:
    case 24000:
    case 32000:
    case 44100:
    case 48000:
      return true;
    default:
      return false;
  }
}

esp_err_t probe(uint8_t address, Codec* codec) {
  if (!codec) return ESP_ERR_INVALID_ARG;
  ES8388_TRY(codec_bus::attach(address, &codec->dev));
  uint8_t value = 0;
  const esp_err_t err = readReg(codec, kRegControl1, &value);
  if (err != ESP_OK) release(codec);
  return err;
}

esp_err_t init(Codec* codec) {
  if (!codec || !codec->dev.attached) return ESP_ERR_INVALID_STATE;
  // es8388_open(): mute, chip control and power management.
  ES8388_TRY(writeReg(codec, kRegDacControl3, kDacMuteBit));
  ES8388_TRY(writeReg(codec, kRegControl2, 0x50));
  ES8388_TRY(writeReg(codec, kRegChipPower, 0x00));
  // Internal DLL off (better at 8 kHz).
  ES8388_TRY(writeReg(codec, 0x35, 0xA0));
  ES8388_TRY(writeReg(codec, 0x37, 0xD0));
  ES8388_TRY(writeReg(codec, 0x39, 0xD0));
  ES8388_TRY(writeReg(codec, kRegMasterMode, 0x00));  // I2S slave.
  // DAC: off while configured, play and record mode, 16-bit I2S, single
  // speed with MCLK/LRCK = 256, only the DAC to the output mixers.
  ES8388_TRY(writeReg(codec, kRegDacPower, 0xC0));
  ES8388_TRY(writeReg(codec, kRegControl1, 0x12));
  ES8388_TRY(writeReg(codec, kRegDacControl1, 0x18));
  ES8388_TRY(writeReg(codec, kRegDacControl2, 0x02));
  ES8388_TRY(writeReg(codec, kRegDacControl16, 0x00));
  ES8388_TRY(writeReg(codec, kRegDacControl17, 0x90));
  ES8388_TRY(writeReg(codec, kRegDacControl20, 0x90));
  // ADC and DAC share the LRCK.
  ES8388_TRY(writeReg(codec, kRegDacControl21, 0x80));
  ES8388_TRY(writeReg(codec, kRegDacControl23, 0x00));
  ES8388_TRY(writeReg(codec, kRegDacControl4, 0x00));
  ES8388_TRY(writeReg(codec, kRegDacControl5, 0x00));
  ES8388_TRY(writeReg(codec, kRegDacControl24, kOutputVolume));
  ES8388_TRY(writeReg(codec, kRegDacControl25, kOutputVolume));
  ES8388_TRY(writeReg(codec, kRegDacControl26, kOutputVolume));
  ES8388_TRY(writeReg(codec, kRegDacControl27, kOutputVolume));
  ES8388_TRY(writeReg(codec, kRegDacPower, kDacPowerAllOutputs));
  // The ADC stays powered down: the Tab5 microphones are on the ES7210.
  ES8388_TRY(writeReg(codec, kRegAdcPower, 0xFF));
  return start(codec);
}

esp_err_t start(Codec* codec) {
  if (!codec || !codec->dev.attached) return ESP_ERR_INVALID_STATE;
  ES8388_TRY(writeReg(codec, kRegChipPower, 0xF0));
  ES8388_TRY(writeReg(codec, kRegChipPower, 0x00));
  return writeReg(codec, kRegDacPower, kDacPowerAllOutputs);
}

esp_err_t setVolumeRegister(Codec* codec, uint8_t es8311_scale) {
  if (!codec || !codec->dev.attached) return ESP_ERR_INVALID_STATE;
  const uint8_t scale = es8311_scale > kEs8311ZeroDb ? kEs8311ZeroDb : es8311_scale;
  uint8_t attenuation = static_cast<uint8_t>(kEs8311ZeroDb - scale);
  if (attenuation > kMaxAttenuation) attenuation = kMaxAttenuation;
  ES8388_TRY(writeReg(codec, kRegDacControl5, attenuation));
  return writeReg(codec, kRegDacControl4, attenuation);
}

esp_err_t setMute(Codec* codec, bool mute) {
  if (!codec || !codec->dev.attached) return ESP_ERR_INVALID_STATE;
  uint8_t value = 0;
  ES8388_TRY(readReg(codec, kRegDacControl3, &value));
  value = static_cast<uint8_t>(mute ? (value | kDacMuteBit) : (value & ~kDacMuteBit));
  return writeReg(codec, kRegDacControl3, value);
}

void release(Codec* codec) {
  if (!codec) return;
  codec_bus::detach(&codec->dev);
}

#undef ES8388_TRY

}  // namespace es8388

#endif  // defined(HOMETILES_SPEAKER)
