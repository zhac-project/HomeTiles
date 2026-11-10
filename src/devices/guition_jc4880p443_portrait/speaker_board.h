#pragma once

// Speaker and microphone wiring of the Guition JC4880P443C_I_W, from the
// board schematic (ultramcu/guition-jc4880p443c-i-w,
// schematic/01-audio-es8311 and 02-speaker, and its pin table: MCLK13 /
// BCLK12 / LRCK10 / DOUT9 / DIN48, amplifier enable GPIO11) and the
// ZyoungInc/JC4880P443C_BSP header (BSP_I2S_DSIN GPIO48, BSP_POWER_AMP_IO
// GPIO11). One ES8311 at I2C 0x18 (CE pulled low by R1) on the touch bus
// (I2C0, SDA 7, SCL 8) does both playback and capture. One analog MEMS mic
// (MSM381) on the ES8311 MIC1P/MIC1N, the ES8311 ASDOUT on GPIO48; GPIO11
// enables the NS4150 amplifier (CTRL active high).

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
constexpr gpio_num_t kI2sDin = GPIO_NUM_48;
constexpr audio_chips::Output kOutput = audio_chips::Output::Es8311;
constexpr uint8_t kCodecAddress = 0x18;
constexpr audio_chips::Input kInput = audio_chips::Input::Es8311;
// ES7210 7-bit address; 0 without an ES7210.
constexpr uint8_t kMicAddress = 0x00;
constexpr gpio_num_t kAmpEnable = GPIO_NUM_11;
constexpr bool kAmpActiveHigh = true;
// Loudest clean level as a fraction of the shared volume scale: the same
// ES8311-to-NS4150 circuit as the Guition JC8012 V2, which distorted and
// switched off at the full scale (user 2026-10-16); 0.6 as there, by
// precaution, not tested on this board.
constexpr float kVolumeLimit = 0.6f;

// The touch-owned I2C bus; nullptr before Device init opened it.
i2c_master_bus_handle_t bus();

}  // namespace speaker_board
