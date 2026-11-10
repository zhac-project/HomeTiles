// Source contract for the screensaver decoder that the background photo reuses:
// TJpgDec streams the file into the cover on every target, the pixel cap counts
// source pixels, and the image inset is a parameter.
import assert from 'node:assert/strict';

import {readRepoFile} from '../../lib/admin-source.mjs';
import {cppFunctionDefinitions} from '../../lib/cpp-source.mjs';

const src = readRepoFile('src', 'ui', 'screensaver', 'image_screensaver.cpp');
const definitions = cppFunctionDefinitions(src);
const fn = (name) => {
  const found = definitions.find((definition) => definition.name === name);
  assert.ok(found, `${name} is missing`);
  return found.body;
};

assert.match(src, /struct S3DirectJpegCtx\s*\{[^}]*fs::File\*/, 'the direct decoder streams from a File');
const direct = fn('s3_decode_jpeg_direct_cover');
assert.ok(!direct.includes('read_wallpaper_file'), 'the direct decoder never reads the whole file');
// TJpgDec decodes every source pixel at scale 0, so the source size bounds the
// decode time of screensaver slides and the background photo alike.
assert.match(direct, /source_pixels =\s*static_cast<uint32_t>\(source_w\) \* source_h;/, 'the cap counts source pixels');
assert.match(direct, /if \(source_pixels > kMaxDecodePixels\) \{[^}]*ImageDecodeFailure::TooLarge;[^}]*return nullptr;/,
  'a source over the cap fails at once and says so');
assert.ok(direct.indexOf('source_pixels > kMaxDecodePixels') < direct.indexOf('alloc_aligned_prefer_psram('),
  'before the output buffer');
assert.ok(!/>>\s*scale/.test(direct) && !src.includes('cover_scale('), 'no scaled-size cap');
assert.ok(src.includes('static_assert(background_rules::kMaxSourcePixels == kMaxDecodePixels'),
  'the photo list refuses what the decoder refuses');
assert.ok(!fn('make_cover_dsc').includes('GRID_PAD') && !direct.includes('GRID_PAD'));
assert.ok(src.includes('constexpr uint16_t kScreensaverImageInset = GRID_PAD > 4 ? GRID_PAD - 4 : 0;'));
assert.ok(fn('get_or_decode_cached').includes('kScreensaverImageInset'));

// LVGL builds TJpgDec with JD_USE_SCALE 0: any other scale returns JDR_PAR.
for (const call of src.matchAll(/jd_decomp\([^;]*\)/g)) {
  assert.match(call[0], /,\s*0\)$/, `TJpgDec must decode at scale 0: ${call[0]}`);
}

// Images the P4 hardware decoder refuses stream through the same direct path,
// so the old source-sized TJpgDec fallback is gone.
const decode = fn('decode_wallpaper_to_size');
assert.ok(!decode.includes('DEVICE_ESP32_S3_RGB_480'), 'the direct path is not S3-only');
for (const call of ['hw_decode_jpeg(', 'open_wallpaper_file(', 's3_decode_jpeg_direct_cover(']) {
  assert.ok(decode.includes(call), `decode_wallpaper_to_size calls ${call}`);
}
assert.ok(!src.includes('sw_decode_jpeg'), 'the source-sized TJpgDec fallback is removed');
assert.match(fn('open_wallpaper_file'), /len < 32 \|\| len > kMaxFileBytes/, 'same size check as before');

// The full-screen cover decode for the background photo, with failure kinds.
const h = readRepoFile('src', 'ui', 'screensaver', 'image_screensaver.h');
const count = (text, needle) => text.split(needle).length - 1;
assert.ok(h.includes('enum class ImageDecodeFailure : uint8_t { None, NotFound, NoMemory, Unreadable, TooLarge };'));
assert.ok(h.includes('lv_image_dsc_t* image_screensaver_decode_full_cover(const char* name, uint16_t w, uint16_t h, uint8_t orientation, ImageDecodeFailure* failure);'));
assert.ok(h.includes('void image_screensaver_free_decoded(lv_image_dsc_t* dsc);'));
const full = fn('image_screensaver_decode_full_cover');
assert.match(full, /decode_wallpaper_to_size\([^;]*500,\s*500,\s*1000,\s*0,\s*0\)/,
  'centred cover, no zoom, no corners, no inset');
assert.match(full, /orientation >= 5 \? h : w/, 'EXIF 5-8 decode a quarter turn away');
assert.ok(full.includes('background_rules::orient('));
assert.ok(fn('image_screensaver_free_decoded').includes('free_screensaver_dsc('),
  'freed like the screensaver cache, including the LVGL image cache entry');
assert.ok(src.includes('static_assert(background_rules::kMaxFileBytes == kMaxFileBytes'));
const budgetCalls = count(src, 'psram_budget_ok(') - 1;  // minus the definition
assert.ok(budgetCalls >= 3, 'hardware, direct and upright buffers are budgeted');
assert.ok(count(src, 'ImageDecodeFailure::NoMemory') >= budgetCalls, 'every budget failure reports NoMemory');
assert.ok(fn('open_wallpaper_file').includes('ImageDecodeFailure::NotFound'));
assert.ok(fn('s3_decode_jpeg_direct_cover').includes('ImageDecodeFailure::Unreadable'));

console.log('background decoder source contract: PASS');
