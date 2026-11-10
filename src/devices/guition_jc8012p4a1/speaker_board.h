#pragma once

// Speaker and microphone wiring of the Guition JC8012P4A1, from Guition's
// schematic (pages 7_CODEC and 3_ESP32-P4 of the JC8012P4A1 documentation
// package, mirrored in profi-max/ JC8012P4A1_BSP_ESP32P4
// Demos_and_Docs/5-Schematic) and its demo BSP
// (esp32_p4_function_ev_board.h, BSP_POWER_AMP_IO GPIO20): one ES8311 at I2C
// 0x18 (CE pulled low by R75) on the touch bus (I2C0, SDA 7, SCL 8) does
// both playback and capture. One analog MEMS mic (MSM381A3729H9CP) on the
// ES8311 MIC1P/MIC1N; the ES8311 ASDOUT reaches GPIO11 (net "ES7210_SDOUT",
// no ES7210 fitted). PA_CTRL GPIO20 enables the NS4150 amplifier (CTRL
// active high, R86 10k pull-down).

#include <driver/gpio.h>
#include <driver/i2c_master.h>

#include "src/audio/codecs/audio_chips.h"

namespace speaker_board {

constexpr gpio_num_t kI2sMclk = GPIO_NUM_13;
constexpr gpio_num_t kI2sBclk = GPIO_NUM_12;
constexpr gpio_num_t kI2sLrck = GPIO_NUM_10;
// Codec DSDIN: data from the P4 to the codec.
constexpr gpio_num_t kI2sDout = GPIO_NUM_9;
// ES8311 ASDOUT: data from the microphone ADC to the P4.
constexpr gpio_num_t kI2sDin = GPIO_NUM_11;
constexpr audio_chips::Output kOutput = audio_chips::Output::Es8311;
constexpr uint8_t kCodecAddress = 0x18;
constexpr audio_chips::Input kInput = audio_chips::Input::Es8311;
// ES7210 7-bit address; 0 without an ES7210.
constexpr uint8_t kMicAddress = 0x00;
constexpr gpio_num_t kAmpEnable = GPIO_NUM_20;
constexpr bool kAmpActiveHigh = true;
// Loudest clean level as a fraction of the shared volume scale: the V2 (the
// same main board) distorted and switched off at the full scale (supply dip,
// user 2026-10-16); 60 % of it sounded best.
constexpr float kVolumeLimit = 0.6f;

// The touch-owned I2C bus; nullptr before Device init opened it.
i2c_master_bus_handle_t bus();

}  // namespace speaker_board
