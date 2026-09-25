import { getBuildProfile } from '../../device-catalog.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

function requireMarker(source, marker, label) {
  assert.ok(source.includes(marker), `${label} is missing: ${marker}`);
}

const base = 'src/devices/sunton_esp32_8048s070c';
const select = read('src/devices/device_select.h');
const active = read('src/devices/active_device.h');
const metadata = read('src/core/firmware/firmware_metadata.cpp');
const webConfig = read('src/web/setup/web_config.cpp');
const facade = read('src/devices/device.cpp');
const sketch = read('sketch.yaml');
const profile = read(`${base}/device_sunton_esp32_8048s070c.h`);
const driver = read(`${base}/device_sunton_esp32_8048s070c.cpp`);

// Wired into every selection list, the S3 RGB lifecycle group and the 480-tall layout.
const define = 'DEVICE_SUNTON_ESP32_8048S070C';
assert.equal(select.split(`defined(${define})`).length - 1, 5, 'selector lists, S3 RGB group and layout group');
requireMarker(select, `// #define ${define}`, 'selector comment');
requireMarker(active, `${base}/device_sunton_esp32_8048s070c.h`, 'active device');
requireMarker(active, 'namespace DeviceImpl = DeviceSuntonESP328048S070C;', 'active namespace');
requireMarker(metadata, '"sunton_esp32_8048s070c"', 'firmware metadata key');
requireMarker(webConfig, '"Sunton_8048S070C_Config"', 'setup access point');
assert.equal(facade.split(`defined(${define})`).length - 1, 2, 'update-check scanout guard');
requireMarker(sketch, '  sunton_esp32_8048s070c:\n    fqbn: esp32:esp32:esp32s3:', 'sketch profile');
assert.equal(getBuildProfile('sunton_esp32_8048s070c').define, define, 'build profile');

// Same 800x480 grid as the Waveshare Touch LCD 4.3.
requireMarker(profile, '    800,\n    480,\n    5,\n    4,\n    10,\n    3,\n    150,\n    111,', 'landscape grid');
requireMarker(profile, 'Device::RotationStepMode::FlipOnly,\n    0,\n    2,', 'flip-only rotation');

// openHASP `sunton-8048s070c_16MB` pins and timing.
for (const [name, pin] of Object.entries({
  De: 41, Vsync: 40, Hsync: 39, Pclk: 42,
  R0: 14, R1: 21, R2: 47, R3: 48, R4: 45,
  G0: 9, G1: 46, G2: 3, G3: 8, G4: 16, G5: 1,
  B0: 15, B1: 7, B2: 6, B3: 5, B4: 4,
})) requireMarker(driver, `constexpr int8_t kPanel${name} = ${pin};`, `panel ${name}`);
for (const [name, value] of Object.entries({
  HsyncFrontPorch: 8, HsyncPulseWidth: 10, HsyncBackPorch: 43,
  VsyncFrontPorch: 8, VsyncPulseWidth: 8, VsyncBackPorch: 12,
})) requireMarker(driver, `constexpr uint16_t k${name} = ${value};`, `timing ${name}`);
requireMarker(driver, 'config.timings.flags.hsync_idle_low = 1;', 'HSYNC polarity');
requireMarker(driver, 'config.timings.flags.vsync_idle_low = 1;', 'VSYNC polarity');
requireMarker(driver, 'config.timings.flags.pclk_active_neg = 1;', 'falling-edge PCLK');
requireMarker(driver, 'constexpr int8_t kBacklightPin = 2;', 'backlight pin');
requireMarker(driver, 'constexpr int8_t kTouchSda = 19;\nconstexpr int8_t kTouchScl = 20;', 'touch bus');
requireMarker(driver, 'constexpr int8_t kTouchRst = 38;', 'touch reset');
assert.ok(!/Arduino_SWSPI|st7701/i.test(driver), 'RGB-only panel: no command bus or ST7701 table');
assert.ok(driver.includes('bool DeviceSuntonESP328048S070C::sdReady() { return false; }'), 'SD stays off until its pins are verified');

console.log('Sunton ESP32-8048S070C profile contract: PASS');
