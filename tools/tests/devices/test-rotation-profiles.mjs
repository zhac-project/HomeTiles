// Every device profile's rotation pair must differ, or the display's
// Rotation 0/180 (or quarter-turn) choice changes nothing and the settings
// read the current orientation as the flipped one. Issue #108: the JC1060
// V2 profile had normal 0 and flipped 0 after e8457f37 moved its default.
// A flip-only profile flips by exactly half a turn.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const devicesDir = path.join(root, 'src/devices');

const profiles = [];
for (const entry of fs.readdirSync(devicesDir, {withFileTypes: true})) {
  if (!entry.isDirectory()) continue;
  for (const file of fs.readdirSync(path.join(devicesDir, entry.name))) {
    if (!file.endsWith('.h')) continue;
    const text = fs.readFileSync(path.join(devicesDir, entry.name, file), 'utf8').replace(/\r\n/g, '\n');
    const match = text.match(
      /Device::RotationStepMode::(FlipOnly|QuarterTurns),\s*\n\s*(\d+),\s*\n\s*(\d+),/);
    if (match) {
      profiles.push({where: `${entry.name}/${file}`, mode: match[1],
        normal: Number(match[2]), flipped: Number(match[3])});
    }
  }
}

// Every profile folder with a device header is covered (S3 and P4 alike).
assert.ok(profiles.length >= 17, `found only ${profiles.length} profiles`);
for (const {where, mode, normal, flipped} of profiles) {
  assert.ok(normal <= 3 && flipped <= 3, `${where}: rotations are quarter turns 0..3`);
  assert.notEqual(normal, flipped, `${where}: normal and flipped rotation are the same (${normal})`);
  if (mode === 'FlipOnly') {
    assert.equal(normal ^ flipped, 2, `${where}: a flip is half a turn`);
  }
}
const jc1060v2 = profiles.find(p => p.where.startsWith('guition_jc1060p470c_v2/'));
assert.deepEqual([jc1060v2.normal, jc1060v2.flipped], [0, 2]);
console.log(`rotation pairs ok in ${profiles.length} profiles`);
