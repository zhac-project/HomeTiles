// The CI installs exactly the library versions the sketch profiles pin. A
// plain `arduino-cli lib install` also installs the library's dependencies in
// their newest version over the pinned ones (M5Unified pulled M5GFX 0.2.32
// instead of 0.2.25 and the Tab5 image no longer fit its OTA slot).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8').replaceAll('\r\n', '\n');

const workflow = read('.github/workflows/firmware.yml');
const installs = [...workflow.matchAll(/arduino-cli lib install ([^\n]*)/g)].map((m) => m[1]);
assert.ok(installs.length > 0, 'the workflow installs its libraries');
const pinned = new Map();
for (const args of installs) {
  assert.ok(args.startsWith('--no-deps "'), `library installed without --no-deps: ${args}`);
  const spec = args.match(/"(.+)@([^"@]+)"$/);
  assert.ok(spec, `library installed without a version: ${args}`);
  pinned.set(spec[1], spec[2]);
}

// Every library a sketch profile uses is installed in that same version.
const used = [];
for (const block of read('sketch.yaml').matchAll(/^ {4}libraries:\n((?: {6}- .+\n?)+)/gm)) {
  for (const line of block[1].matchAll(/^ {6}- (.+) \(([^)]+)\)$/gm)) used.push(line);
}
assert.ok(used.length > 0, 'sketch.yaml lists the profile libraries');
for (const [, name, version] of used) {
  assert.equal(pinned.get(name), version, `${name}: CI installs ${pinned.get(name)}, sketch.yaml pins ${version}`);
}

console.log(`PASS: CI installs ${pinned.size} libraries in their pinned versions without dependencies`);
