#include "src/audio/speaker_select.h"

#if defined(HOMETILES_SPEAKER)

#include "src/audio/audio_board.h"

#include <Arduino.h>
#include <driver/gpio.h>

#include "src/audio/codecs/audio_chips.h"
#include "src/audio/codecs/es7210/es7210_codec.h"
#include "src/audio/codecs/es8311/es8311_codec.h"
#include "src/audio/codecs/es8388/es8388_codec.h"
#include "src/audio/speaker.h"
#include HOMETILES_SPEAKER_BOARD

namespace audio_board {
namespace {

using audio_chips::Input;
using audio_chips::Output;

constexpr const char* kLogPrefix = "[Speaker]";

static_assert(speaker::kMaxMicGainStep == es7210::kMaxGainStep &&
                  speaker::kDefaultMicGainStep == es7210::kDefaultGainStep,
              "speaker mic gain steps are the ES7210 gain steps");
static_assert(es8311::kMclkMultiple == 256 && es7210::kMclkMultiple == 256 &&
                  es8388::kMclkMultiple == 256,
              "the speaker core drives MCLK at 256 x fs for every codec");
static_assert(speaker_board::kInput != Input::Es7210 || speaker_board::kMicAddress != 0,
              "an ES7210 board names the ADC's address");
static_assert(speaker_board::kInput != Input::Es8311 || speaker_board::kOutput == Output::Es8311,
              "the ES8311 microphone is the output codec's own ADC");

es8311::Codec g_es8311;
es8388::Codec g_es8388;
es7210::Codec g_es7210;
bool g_output_ready = false;

}  // namespace

void initAmp() {
#if !defined(HOMETILES_SPEAKER_AMP_BY_BOARD)
  gpio_config_t config = {};
  config.pin_bit_mask = 1ULL << speaker_board::kAmpEnable;
  config.mode = GPIO_MODE_OUTPUT;
  gpio_config(&config);
#endif
  setAmp(false);
}

void setAmp(bool on) {
#if defined(HOMETILES_SPEAKER_AMP_BY_BOARD)
  speaker_board::setAmp(on);
#else
  const bool level = speaker_board::kAmpActiveHigh ? on : !on;
  gpio_set_level(speaker_board::kAmpEnable, level ? 1 : 0);
#endif
}

const char* outputName() {
  return speaker_board::kOutput == Output::Es8388 ? "ES8388" : "ES8311";
}

const char* inputName() {
  switch (speaker_board::kInput) {
    case Input::Es7210:
      return "ES7210";
    case Input::Es8311:
      return "ES8311 ADC";
    case Input::None:
    default:
      return "none";
  }
}

bool probeOutput(uint32_t initial_rate) {
  esp_err_t err = ESP_OK;
  if (speaker_board::kOutput == Output::Es8388) {
    err = es8388::probe(speaker_board::kCodecAddress, &g_es8388);
    if (err == ESP_OK) err = es8388::init(&g_es8388);
    if (err != ESP_OK) es8388::release(&g_es8388);
  } else {
    err = es8311::probe(speaker_board::kCodecAddress, &g_es8311);
    if (err == ESP_OK) err = es8311::init(&g_es8311, initial_rate);
    if (err != ESP_OK) es8311::release(&g_es8311);
  }
  if (err != ESP_OK) {
    Serial.printf("%s %s not ready (%s), speaker disabled\n", kLogPrefix, outputName(),
                  esp_err_to_name(err));
    return false;
  }
  g_output_ready = true;
  Serial.printf("%s %s ready at 0x%02X\n", kLogPrefix, outputName(),
                speaker_board::kCodecAddress);
  return true;
}

bool outputSupportsRate(uint32_t rate) {
  return speaker_board::kOutput == Output::Es8388 ? es8388::supportsSampleRate(rate)
                                                  : es8311::supportsSampleRate(rate);
}

esp_err_t setOutputRate(uint32_t rate) {
  if (!g_output_ready) return ESP_ERR_INVALID_STATE;
  // The ES8388 runs single speed at MCLK = 256 x fs and needs no dividers.
  if (speaker_board::kOutput == Output::Es8388) {
    return es8388::supportsSampleRate(rate) ? ESP_OK : ESP_ERR_NOT_SUPPORTED;
  }
  return es8311::setSampleRate(&g_es8311, rate);
}

esp_err_t startOutput() {
  if (!g_output_ready) return ESP_ERR_INVALID_STATE;
  return speaker_board::kOutput == Output::Es8388 ? es8388::start(&g_es8388) : ESP_OK;
}

esp_err_t setOutputVolumeRegister(uint8_t value) {
  if (!g_output_ready) return ESP_ERR_INVALID_STATE;
  return speaker_board::kOutput == Output::Es8388 ? es8388::setVolumeRegister(&g_es8388, value)
                                                  : es8311::setVolumeRegister(&g_es8311, value);
}

esp_err_t setOutputMute(bool mute) {
  if (!g_output_ready) return ESP_ERR_INVALID_STATE;
  return speaker_board::kOutput == Output::Es8388 ? es8388::setMute(&g_es8388, mute)
                                                  : es8311::setMute(&g_es8311, mute);
}

// The ES7210 is configured once here to prove it answers, and again at every
// capture start once MCLK runs. The ES8311 microphone needs the codec the
// output probe already set up.
bool probeInput(uint32_t rate, uint8_t gain_step) {
  esp_err_t err = ESP_OK;
  uint16_t chip_id = 0;
  switch (speaker_board::kInput) {
    case Input::None:
      return false;
    case Input::Es7210:
      err = es7210::probe(speaker_board::kMicAddress, &g_es7210, &chip_id);
      if (err == ESP_OK) err = es7210::init(&g_es7210, rate, gain_step);
      if (err != ESP_OK) es7210::release(&g_es7210);
      break;
    case Input::Es8311:
      err = g_output_ready ? ESP_OK : ESP_ERR_INVALID_STATE;
      break;
  }
  if (err != ESP_OK) {
    Serial.printf("%s %s not ready (%s), Assist microphone disabled\n", kLogPrefix, inputName(),
                  esp_err_to_name(err));
    return false;
  }
  if (speaker_board::kInput == Input::Es7210) {
    Serial.printf("%s ES7210 ready at 0x%02X (id 0x%04X)\n", kLogPrefix,
                  speaker_board::kMicAddress, static_cast<unsigned>(chip_id));
  } else {
    Serial.printf("%s Microphone on the %s at 0x%02X\n", kLogPrefix, inputName(),
                  speaker_board::kCodecAddress);
  }
  return true;
}

esp_err_t startInput(uint32_t rate, uint8_t gain_step) {
  switch (speaker_board::kInput) {
    case Input::Es7210:
      // Reprogram the ADC now that its clocks run, as the esp-bsp examples do.
      return es7210::init(&g_es7210, rate, gain_step);
    case Input::Es8311: {
      if (!g_output_ready) return ESP_ERR_INVALID_STATE;
      // DAC and ADC share the clock setup: switch it to the capture rate.
      const esp_err_t err = es8311::setSampleRate(&g_es8311, rate);
      if (err != ESP_OK) return err;
      return es8311::startMicrophone(
          &g_es8311, es8311::micScaleForTenthsDb(speaker::micGainTenthsDb(gain_step)));
    }
    case Input::None:
    default:
      return ESP_ERR_NOT_SUPPORTED;
  }
}

}  // namespace audio_board

#endif  // defined(HOMETILES_SPEAKER)
