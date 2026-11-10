// ZHAC fork: the cloud layout editor has no Web Admin page script (LAYOUTS),
// so GET /api/layouts reports each layout's grid the same way
// (web_admin_scripts.cpp LAYOUTS): cols, rows (x.5 with a half row), head bar,
// portrait, available, switchable and the screen size.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const cpp = fs.readFileSync(path.join(root, 'src/web/server/handlers/web_admin_tiles.cpp'), 'utf8');
const start = cpp.indexOf('void WebAdminServer::handleGetLayouts() {');
assert.ok(start >= 0, 'handleGetLayouts');
const end = cpp.indexOf('sendChunkedResponse(server, 200, "application/json", json);', start);
assert.ok(end > start, 'handleGetLayouts sends its JSON');
const body = cpp.slice(start, end);

const grids = body.indexOf('\\"grids\\"');
assert.ok(grids > 0, 'GET /api/layouts reports "grids"');
const block = body.slice(grids);
assert.ok(body.lastIndexOf('// ZHAC fork:', grids) > body.indexOf('settings_tile_snapshot'), 'fork comment above the block');
for (const part of ['grid_layout::kLayoutCount', 'grid_layout::layout_grid(', 'grid_layout::key(',
  'grid_layout::available(', 'grid_layout::switchable(', 'half_row ? ".5"', '\\"cols\\":', '\\"rows\\":',
  '\\"bar\\":', '\\"portrait\\":', '\\"available\\":', '\\"switchable\\":', '\\"screen_w\\":', '\\"screen_h\\":']) {
  assert.ok(block.includes(part), `grids block uses ${part}`);
}
console.log('ok - GET /api/layouts reports each layout grid for the cloud editor');
