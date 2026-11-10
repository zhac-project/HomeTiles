#pragma once

// Speaker and microphone wiring of the M5Stack Tab5, from Espressif's BSP
// (esp-bsp bsp/m5stack_tab5: BSP_I2S_MCLK 30, SCLK 27, LCLK 29, DOUT 26,
// DSIN 28, BSP_SPEAKER_EN = IO expander pin 1 at the low PI4IOE5V6408
// address, ES8388 and ES7210 at their default addresses) and M5Unified
// 0.2.14 (ES8388 0x10, ES7210 0x40, amplifier bit 1 of output register 0x05
// on the expander at 0x43). The codecs share M5Unified's internal I2C bus
// (SDA 31, SCL 32), which M5Unified owns, so register access and the
// amplifier go through M5Unified (speaker_board.cpp). The ES7210 sends
// MIC1/MIC2 on DSIN in standard I2S.

#include <driver/gpio.h>

#include "src/audio/codecs/audio_chips.h"

namespace speaker_board {

constexpr gpio_num_t kI2sMclk = GPIO_NUM_30;
constexpr gpio_num_t kI2sBclk = GPIO_NUM_27;
constexpr gpio_num_t kI2sLrck = GPIO_NUM_29;
// Codec DSDIN: data from the P4 to the ES8388.
constexpr gpio_num_t kI2sDout = GPIO_NUM_26;
// ES7210 SDOUT: data from the microphone ADC to the P4.
constexpr gpio_num_t kI2sDin = GPIO_NUM_28;
constexpr audio_chips::Output kOutput = audio_chips::Output::Es8388;
constexpr uint8_t kCodecAddress = 0x10;
constexpr audio_chips::Input kInput = audio_chips::Input::Es7210;
// ES7210 7-bit address; 0 without an ES7210.
constexpr uint8_t kMicAddress = 0x40;
// The amplifier hangs on the IO expander: setAmp() below.
constexpr gpio_num_t kAmpEnable = GPIO_NUM_NC;
constexpr bool kAmpActiveHigh = true;
// Loudest clean level as a fraction of the shared volume scale: at the full
// scale the Tab5 distorted and switched off (user 2026-10-16); 90 % of it
// sounded best.
constexpr float kVolumeLimit = 0.9f;

// SPK_EN on the IO expander (HOMETILES_SPEAKER_AMP_BY_BOARD).
void setAmp(bool on);

}  // namespace speaker_board
