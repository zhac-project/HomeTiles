// The MDI icon files (tools/generate-icon-files.mjs) must carry every glyph
// bitmap of the built-in fonts byte for byte, reject damaged or foreign files,
// and the built-in core list must cover every icon name the firmware itself
// uses, so a panel without the file still shows its own icons.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SIZES, HEADER_BYTES, buildIconFile, compiledFontSource, coreGlyphIds, crc32, firmwareIconNames,
  fontOutputPath, fontSourcePath, glyphBytes, glyphIdOf, iconNameTable, parseMdiFont, readCoreList,
  readIconFile, tableBytes,
} from '../../generate-icon-files.mjs';

// CRC32 check value of the zlib/ESP ROM variant.
assert.equal(crc32(Buffer.from('123456789')), 0xCBF43926);

const names = iconNameTable();
const core = readCoreList();
const tableCrcs = new Set();
const summary = [];

for (const px of SIZES) {
  const source = fs.readFileSync(fontSourcePath(px), 'utf8');
  const font = parseMdiFont(source, `mdi_icons_${px}`);

  // The compiled font is the current output of the generator.
  const compiled = fs.readFileSync(fontOutputPath(px), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(compiled, compiledFontSource(source, font, px, coreGlyphIds(font, core, names)),
    `src/fonts/mdi_icons_${px}.c is out of date; run node tools/generate-icon-files.mjs`);
  assert.equal(font.bpp, 4, `${px}: 4 bpp`);
  assert.equal(font.bitmapFormat, 1, `${px}: compressed bitmaps`);
  assert.equal(font.glyphs.length, 7448, `${px}: glyph count`);

  const file = buildIconFile(font, px);
  const {header, bitmap} = readIconFile(file);
  assert.equal(header.px, px);
  assert.equal(header.glyphs, font.glyphs.length);
  assert.equal(header.tableCrc, crc32(tableBytes(font)));
  assert.equal(file.length, HEADER_BYTES + font.bitmap.length);
  assert.equal(Buffer.compare(bitmap, Buffer.from(font.bitmap)), 0, `${px}: bitmaps byte for byte`);
  tableCrcs.add(header.tableCrc);

  // Each glyph is found at its descriptor's bitmap index, as the firmware reads it.
  let covered = 0;
  for (let id = 1; id < font.glyphs.length; id++) {
    const expected = glyphBytes(font, id);
    const start = font.glyphs[id].bitmapIndex;
    assert.equal(Buffer.compare(bitmap.subarray(start, start + expected.length), Buffer.from(expected)), 0,
      `${px}: glyph ${id}`);
    covered += expected.length;
  }
  assert.equal(covered, font.bitmap.length, `${px}: the glyphs cover the whole bitmap`);

  // Damaged files are refused.
  const damagedBitmap = Buffer.from(file);
  damagedBitmap[HEADER_BYTES + 1000] ^= 0x01;
  assert.throws(() => readIconFile(damagedBitmap), /bitmap CRC/);
  const damagedHeader = Buffer.from(file);
  damagedHeader[8] ^= 0x01;
  assert.throws(() => readIconFile(damagedHeader), /header CRC/);
  assert.throws(() => readIconFile(file.subarray(0, file.length - 1)), /wrong length/);

  // Every core icon exists in this size and has a bitmap.
  let coreBytes = 0;
  for (const name of core) {
    const id = glyphIdOf(font, names.get(name));
    assert.ok(id > 0, `${px}: core icon ${name} is in the font`);
    coreBytes += glyphBytes(font, id).length;
  }
  summary.push(`${px} px ${file.length} B, core ${coreBytes} B`);
}
assert.equal(tableCrcs.size, SIZES.length, 'each size has its own descriptor table');

// The core list names real icons, once each, and covers the firmware's own names.
assert.equal(new Set(core).size, core.length, 'core icons are listed once');
for (const name of core) assert.ok(names.has(name), `core icon ${name} is an MDI icon`);
// Names the firmware builds at runtime ("wifi-strength-%u%s": the WiFi row of
// Settings showed the unknown icon without the file) and HA's usual entity
// icons are built in.
for (const name of [
  'wifi-strength-1', 'wifi-strength-2', 'wifi-strength-3', 'wifi-strength-4', 'wifi-strength-4-lock',
  'door-open', 'window-open', 'motion-sensor', 'thermometer', 'water-percent', 'battery-50', 'lightbulb',
]) {
  assert.ok(core.includes(name), `core icon ${name}`);
}
const missing = [...firmwareIconNames(names)].filter((name) => !core.includes(name));
assert.deepEqual(missing, [],
  'icon names of the firmware sources are missing in tools/icons/core-icons.txt; ' +
  'run node tools/generate-icon-files.mjs --update-core');

console.log(`PASS: icon files byte-identical, damaged files refused, ${core.length} core icons (${summary.join('; ')})`);
