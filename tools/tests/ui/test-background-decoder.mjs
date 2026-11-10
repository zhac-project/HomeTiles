// Source contract for the screensaver decoder that the background photo reuses:
// on the 8 MB S3 boards TJpgDec streams the card file into the cover (no
// whole-file PSRAM buffer), the pixel cap counts source pixels, and decode
// failures say why. The P4 keeps upstream's hardware-then-TJpgDec path.
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

// TJpgDec decodes the cover at scale 0 (LVGL builds it with JD_USE_SCALE 0).
assert.match(direct, /jd_decomp\([^;]*,\s*0\)/, 'the direct decoder runs at scale 0');

// The S3 streams card files through the direct path; pictures in memory and
// other targets read the whole file as upstream does.
const decode = fn('decode_wallpaper_to_size');
const s3 = decode.indexOf('#if defined(DEVICE_ESP32_S3_RGB_480)');
assert.ok(s3 >= 0, 'an S3 branch');
const stream = decode.slice(s3, decode.indexOf('#else', s3));
assert.ok(stream.includes('open_wallpaper_file(') && /s3_decode_jpeg_direct_cover\([^;]*&file\)/.test(stream),
  'the S3 streams the card file');
assert.ok(!stream.includes('read_wallpaper_file('), 'no whole-file buffer on the S3');
assert.match(fn('s3_direct_jpeg_input'), /if \(ctx && ctx->file\)/, 'the input reads the File');
assert.match(fn('open_wallpaper_file'), /len < 32 \|\| len > kMaxFileBytes/, 'same size check as before');

// The full-screen cover decode for the background photo, with failure kinds.
const h = readRepoFile('src', 'ui', 'screensaver', 'image_screensaver.h');
const count = (text, needle) => text.split(needle).length - 1;
assert.ok(h.includes('enum class ImageDecodeFailure : uint8_t { None, NotFound, NoMemory, Unreadable, TooLarge };'));
assert.ok(h.includes('lv_image_dsc_t* image_screensaver_decode_full_cover(const char* name, uint16_t w, uint16_t h, uint8_t orientation, ImageDecodeFailure* failure);'));
assert.ok(h.includes('void image_screensaver_free_decoded(lv_image_dsc_t* dsc);'));
const full = fn('image_screensaver_decode_full_cover');
assert.match(full, /decode_wallpaper_to_size\([^;]*500,\s*500,\s*1000,\s*0\)/,
  'centred cover, no zoom, no corners');
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
