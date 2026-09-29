// tools/build-profile.sh fails a build whose image does not fit its app slot
// (arduino-cli checks custom partition profiles only against the whole flash)
// and an ESP32-P4 image without the ESP-Hosted fixes.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
if (spawnSync('bash', ['--version']).status !== 0) {
  console.log('SKIP: tools/build-profile.sh needs bash');
  process.exit(0);
}

// The layout of partitions.csv as gen_esp32part writes it: 32-byte entries.
const table = Buffer.alloc(0xc00, 0xff);
[[1, 0x02, 0x9000, 0x5000], [1, 0x00, 0xe000, 0x2000], [0, 0x10, 0x10000, 0x680000],
  [0, 0x11, 0x690000, 0x680000], [1, 0x82, 0xd10000, 0x2e0000], [1, 0x03, 0xff0000, 0x10000]]
  .forEach(([type, subtype, offset, size], index) => {
    table.writeUInt16LE(0x50aa, index * 32);
    table[index * 32 + 2] = type;
    table[index * 32 + 3] = subtype;
    table.writeUInt32LE(offset, index * 32 + 4);
    table.writeUInt32LE(size, index * 32 + 8);
  });
const s3 = 'HTTPS host=%s tls=%d (%s) allocator=%s';
const rpc = 'HomeTiles RPC sync serialization active';
const rx = 'HomeTiles SDIO RX recovery active (a8204f9 raw PKT_LEN + pending drain)';

const build = path.join(root, 'build');
fs.mkdirSync(build, {recursive: true});
const directory = fs.mkdtempSync(path.join(build, 'test-build-profile-'));
function check(profile, size, strings) {
  const image = Buffer.alloc(size);
  image.write(strings.join('\0'), 64);
  fs.writeFileSync(path.join(directory, 'HomeTiles.ino.bin'), image);
  fs.writeFileSync(path.join(directory, 'HomeTiles.ino.partitions.bin'), table);
  return spawnSync('bash', [path.join(root, 'tools/build-profile.sh'), '--check', profile, directory],
    {encoding: 'utf8'});
}
try {
  let run = check('sunton_esp32_8048s070c', 0x680000, [s3]);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /image 6815744 bytes, app slot 6815744 bytes, 0 bytes free/);
  run = check('sunton_esp32_8048s070c', 0x680001, [s3]);
  assert.notEqual(run.status, 0, 'One byte over the app slot fails');
  assert.match(run.stderr, /image is 6815745 bytes, larger than its 6815744-byte app slot/);

  run = check('guition_jc4880p443_portrait', 4096, [rpc, rx]);
  assert.equal(run.status, 0, run.stderr);
  run = check('guition_jc4880p443_portrait', 4096, [rpc]);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /SDIO RX recovery fix missing/);
  run = check('guition_jc4880p443_portrait', 4096, [rpc, rx, 'pkt_rxbuff']);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /stock ESP-Hosted assert 'pkt_rxbuff'/);
  run = check('guition_jc8012p4a1', 4096, [rpc, rx]);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /JC8012 single-block RX patch missing/);
} finally {
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(build));
  fs.rmSync(directory, {recursive: true, force: true});
}
console.log('build-profile.sh gates: app slot boundary and ESP-Hosted markers passed.');
