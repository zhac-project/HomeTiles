# Sunton ESP32-8048S070C

Experimental HomeTiles target for the Sunton (Shenzhen Jingcai) `ESP32-8048S070C`:

- ESP32-S3-WROOM-1 N16R8: 16 MB flash, 8 MB octal PSRAM
- 7-inch 800 x 480 RGB panel (RGB-only, no command bus or init table)
- GT911 capacitive touch on I2C (SDA 19, SCL 20, reset 38, INT not wired)
- PWM backlight on GPIO 2
- USB-UART (CH340) on UART0 for flashing and logs

Pin map and panel timing come from openHASP's `sunton-8048s070c_16MB`
environment (`user_setups/esp32s3/sunton-esp32-s3-tft.ini`), which runs on
this exact board: HSYNC front/pulse/back 8/10/43, VSYNC 8/8/12, both
polarity 0 (idle low), data on the falling PCLK edge. HomeTiles uses 12 MHz
(openHASP notes 12 MHz as good and runs 13.9 MHz) to leave PSRAM bandwidth for
WiFi/TLS next to the continuous scanout.

The display, storage-write and update-check handling is the Guition
ESP32-4848S040 driver's (same S3 + direct PSRAM framebuffer design); only the
board wiring differs.

Not supported yet: the microSD slot (pins not verified) and the speaker
output. The backlight's 1 % floor (`backlight_input_min`) is not calibrated.
