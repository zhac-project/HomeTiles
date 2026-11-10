# ES8388 codec driver for the speaker

Compiled for every profile that defines `HOMETILES_SPEAKER` in
`src/audio/speaker_select.h`; used by the boards whose speaker codec is an
ES8388 (first: M5Stack Tab5).

## Source

- Espressif `esp-adf`, component `esp_codec_dev`, commit
  `e05f54d46f199df781c2e67c35c0f8ca916a4cdc`, files
  `components/esp_codec_dev/device/es8388/es8388.c`,
  `components/esp_codec_dev/device/es8388/es8388_reg.h` and
  `components/esp_codec_dev/device/include/es8388_codec.h`
  (`ES8388_CODEC_DEFAULT_ADDR` 0x20 in 8-bit form = 0x10).
- License: Apache-2.0, see `LICENSE-APACHE-2.0.txt`. The original SPDX notice
  is retained in `es8388_codec.cpp`.
- M5Stack `M5Unified` 0.2.14 (MIT), `src/M5Unified.cpp`,
  `_speaker_enabled_cb_tab5()`: the output volume 0x21 on DACCONTROL24-27.

## What was taken

- The DAC part of `es8388_open()` (mute, chip control, DLL off, slave mode,
  16-bit I2S, single speed with DACFsRatio 256, DAC-only output mixers,
  shared LRCK, 0 dB digital volume, all four outputs powered) and the DAC
  part of `es8388_start()` (state machine restart, DAC power).
- The DAC volume registers DACCONTROL4/5 (0 = 0 dB, 0xC0 = -96 dB) and the
  soft mute bit 2 of DACCONTROL3.

## What changed

- Register access uses `codec_bus` (the board's transport) instead of the
  `audio_codec_ctrl_if_t` interface.
- The ADC path, line bypass, format setters, PA control and reference
  counting were left out; the ADC stays powered down.
- The output volume of LOUT1/ROUT1/LOUT2/ROUT2 is M5Unified's Tab5 value
  (+4.5 dB on all four) instead of esp_codec_dev's 0 dB on OUT1 and -30 dB on
  OUT2.
- The probe (reading register 0x00) is new.
