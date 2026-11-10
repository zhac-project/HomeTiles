// The firmware stores the Admin CSS without its comments, blank lines and
// indentation (2026-10-14: its comments took 12 KB of flash, the Tab5 image
// no longer fit its OTA slot). Only comments and whitespace may change.
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {formatCssDelivery} from '../../lib/admin-delivery.mjs';
import {readRepoFile} from '../../lib/admin-source.mjs';

const include = readRepoFile('src/web/generated/admin_css_gzip.inc');
const delivered = gunzipSync(Buffer.from([...include.matchAll(/0x([0-9a-f]{2})/g)]
  .map(match => Number.parseInt(match[1], 16)))).toString('utf8');
const source = readRepoFile('src/web/assets/admin.css');

assert.equal(delivered, formatCssDelivery(source), 'The firmware holds the formatted source');
assert.ok(!delivered.includes('/*'), 'No comment reaches the firmware');
assert.ok(delivered.length < source.length * 0.8, 'Comments and indentation are gone');

// Comments go, rules and strings stay as they are.
assert.equal(formatCssDelivery('/* a */\n.a {\n  color: red; /* b */\n}\n\n.b::after { content: "/* c */"; }\n'),
  '.a {\ncolor: red;\n}\n.b::after { content: "/* c */"; }\n');
assert.equal(formatCssDelivery(".x { content: 'it\\'s /* d */'; }\n"), ".x { content: 'it\\'s /* d */'; }\n");
// A comment between two tokens would join them: refused.
assert.throws(() => formatCssDelivery('.a/* e */.b { color: red; }\n'), /joins two tokens/);
assert.throws(() => formatCssDelivery('.a { color: red; } /* open\n'), /unterminated comment/);

console.log('Admin CSS delivery: comments and indentation stay in the source, the firmware holds the rules only');
