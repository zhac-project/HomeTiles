# ES8311 codec driver for the speaker and the Guition microphone

Compiled for every profile that defines `HOMETILES_SPEAKER` in
`src/audio/speaker_select.h` (first: Waveshare ESP32-P4-WIFI6-Touch-LCD-7B).
On the Guition boards the ES8311 is also the microphone ADC.

## Source

- Espressif `esp-bsp`, component `es8311` 1.0.0~1, commit
  `f259a6abd5808019b1903a422092a4234ca95a51`, files
  `components/es8311/es8311.c` and `components/es8311/priv_include/es8311_reg.h`.
- Espressif `esp-adf`, component `esp_codec_dev`, commit
  `e05f54d46f199df781c2e67c35c0f8ca916a4cdc`, file
  `components/esp_codec_dev/device/es8311/es8311.c`: the microphone start.
- License: Apache-2.0, see `LICENSE-APACHE-2.0.txt`. The original SPDX notice
  is retained in `es8311_codec.cpp`.

## What was taken

- The nine `coeff_div[]` rows whose MCLK is 256 x the sample rate (8 kHz to
  48 kHz), verbatim.
- The register sequences of `es8311_init()` (reset, clock source, slave I2S
  format, 16-bit serial ports, DAC power-up), `es8311_sample_frequency_config()`,
  the DAC volume register `0x32` and the DAC mute bits of `0x31`.

- From esp_codec_dev: the ADC lines of `es8311_open()` (register 0x44 = 0x08,
  ADC HPF 0x1B = 0x0A) and of `es8311_start()` for an analog microphone
  (ADC volume 0x17 = 0xBF, 0x0E = 0x02, MIC1 with the 30 dB PGA 0x14 = 0x1A,
  0x0D = 0x01, 0x15 = 0x40), and the ADC gain scale register 0x16 of
  `es8311_set_mic_gain()` (0..7 = 0..42 dB in 6 dB steps).

## What changed

- Register access uses `codec_bus` (the board's transport): the legacy
  `i2c_master_write_to_device()` calls of the original cannot share the bus
  that the display and touch drivers already opened with `i2c_master`.
- Fade and register-dump functions were left out; PDM microphones are not
  supported.
- The chip ID check (`0xFD`/`0xFE` = `0x83`/`0x11`) is new.
