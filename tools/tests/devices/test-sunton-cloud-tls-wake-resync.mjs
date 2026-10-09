// Sunton 8048S070C field failure (2026-10-09): after hours of uptime the ZHAC
// Cloud link could not reconnect (mbedTLS 0x4290, an MPI allocation failed in
// internal RAM), so tile values froze and switches stopped working; the image
// had also shifted. The board puts TLS in PSRAM from boot, and every wake
// resynchronizes the RGB scanout while the backlight is still off.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cppFunctionDefinitions} from '../../lib/cpp-source.mjs';

const read = relative => fs.readFileSync(new URL(`../../../${relative}`, import.meta.url), 'utf8')
  .replaceAll('\r\n', '\n');
const definition = (source, name) => {
  const found = cppFunctionDefinitions(source).find(item => item.name === name);
  assert.ok(found, `${name} must exist`);
  return found.source;
};

// --- The board TLS allocator is in place before anything opens a TLS session
const setup = definition(read('HomeTiles.ino'), 'setup');
const guard = setup.indexOf('#if defined(DEVICE_SUNTON_ESP32_8048S070C)');
const install = setup.indexOf('TlsMemory::installDefault();', guard);
assert.ok(guard >= 0 && install > guard, 'setup() installs the TLS allocator on the Sunton only');
assert.ok(install < setup.indexOf('#endif', guard) || setup.indexOf('#endif', guard) < 0,
  'the install sits inside the Sunton guard');
assert.ok(install < setup.indexOf('BoardHAL::init()'),
  'before the board init, whose PHY calibration may start Wi-Fi');
assert.ok(install < setup.indexOf('networkManager.init();'), 'before the network starts');

// --- Scoped update/OTA allocators restore the board default ------------------
const update = read('src/core/firmware/github_update.cpp');
const scope = update.slice(update.indexOf('class ScopedCheckTlsAllocator'),
  update.indexOf('struct ParsedHttpsUrl'));
assert.match(scope, /~ScopedCheckTlsAllocator\(\)[\s\S]*TlsMemory::installDefault\(\)/,
  'leaving a scoped allocator restores the board default');
assert.doesNotMatch(scope, /set_calloc_free\(checkTlsInternalCalloc/,
  'a scope must not reset the Sunton to internal-only TLS');

// --- Wake: resync the RGB scanout before the backlight returns ----------------
const wake = definition(read('src/core/power/power_manager.cpp'),
  'PowerManager::wakeFromDisplaySleep');
const dark = wake.indexOf('BoardHAL::setBrightness(0);');
const wakeGuard = wake.indexOf('#if defined(DEVICE_SUNTON_ESP32_8048S070C)', dark);
const begin = wake.indexOf('Device::storageWriteBegin();', wakeGuard);
const end = wake.indexOf('Device::storageWriteEnd();', begin);
const lit = wake.indexOf('BoardHAL::setBrightness(saved_brightness);');
assert.ok(dark >= 0 && wakeGuard > dark, 'the resync runs on the Sunton only, after the backlight is off');
assert.ok(begin > wakeGuard && end > begin, 'the resync uses the balanced storage-guard pair');
assert.ok(lit > end, 'the backlight returns only after the resync');
assert.doesNotMatch(wake.slice(wakeGuard, end), /ESP\.restart|BoardHAL::restart/,
  'the wake resync must not reboot the device');

console.log('Sunton cloud TLS allocator and wake resync contracts passed');
