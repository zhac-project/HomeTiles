// A folder with tiles in it must never go without a question (user
// 2026-10-12: choosing "Empty" in the type list of a folder tile autosaved
// and the panel deleted the whole folder with its tiles; the user lost a
// folder). It goes only by the Delete button or the layout window's cross
// after a question naming it, or by an import that replaces the grid.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const slice = (text, start, end) => {
  const from = text.indexOf(start);
  assert.ok(from >= 0, 'missing ' + start);
  return text.slice(from, text.indexOf(end, from + start.length) + end.length);
};

// The type list: greyed out as a whole for a folder with tiles (user
// 2026-10-12), and the special tiles' lock keeps it so.
const autosave = read('src/web/admin/tiles/autosave.js');
const lock = slice(autosave, 'function applyFolderTypeLock(tab, locked) {', '\n  }\n');
assert.match(lock, /sel\.dataset\.folderLocked = locked \? '1' : '';\s*sel\.disabled = locked \|\| !!getTileTypeMeta\(sel\.value\)\.locked;/, 'The whole list is locked');
assert.doesNotMatch(lock, /opt\.value !== '0'/);
assert.match(read('src/web/admin/tiles/type-selection.js'),
  /if \(typeEl\) typeEl\.disabled = locked \|\| typeEl\.dataset\.folderLocked === '1';/);

// The Delete button asks first, naming the folder; only then the save says so.
const reset = slice(autosave, 'function resetTile(tab) {', '\n  }\n');
assert.match(reset, /if \(Number\(stored\?\.type\) === 4 && stored\.folder_empty === false\) \{\s*const name = stored\.title \|\| t\('folderPrefix'\)\.trim\(\);\s*if \(!confirm\(tf\('deleteFolderConfirm', \{ name \}\)\)\) return;\s*confirmedFolderDeletes\.add\(tab \+ ':' \+ currentTileIndex\);/);
assert.match(autosave, /if \(\(snapshot\.type \|\| '0'\) === '0' && confirmedFolderDeletes\.delete\(tab \+ ':' \+ tileIndex\)\) \{\s*formData\.append\('delete_folder', '1'\);/);

// The layout window's cross asks with the folder's question.
const layout = slice(read('src/web/admin/tiles/layout-window.js'), 'async function deleteLayoutTile() {', '\n  }\n');
assert.match(layout, /const question = folder \? tf\('deleteFolderConfirm', \{name\}\) : tf\('layoutDeleteConfirm', \{tile: name\}\);/);
assert.match(layout, /if \(folder\) form\.append\('delete_folder', '1'\);/);

// The panel refuses every other way: a type change, Empty included, keeps a
// folder with tiles unless the deletion was confirmed.
const tiles = read('src/web/server/handlers/web_admin_tiles.cpp');
assert.match(tiles, /if \(previous_tile\.type == TILE_FOLDER && type != TILE_FOLDER\) \{\s*const uint16_t target_id = getNavigateTargetId\(previous_tile\);\s*const bool confirmed = type == TILE_EMPTY && server\.arg\("delete_folder"\) == "1";\s*if \(target_id != 0 && !confirmed && folderHasContent\(target_id\)\) \{\s*server\.send\(409,/);

// No hint text under the tile settings any more (user: it annoyed).
assert.doesNotMatch(read('src/web/server/render/web_admin_html.cpp'), /_tile_type_hint/);
assert.doesNotMatch(read('src/core/i18n/i18n.h'), /admin_folder_type_locked/);


// Greyed out like a disabled button, and on hover it says why (user
// 2026-10-12), in every language.
assert.match(read('src/web/assets/admin.css'), /select:disabled \{ opacity:\.45; cursor:not-allowed; \}/);
assert.match(lock, /const tip = locked \? t\('folderTypeLocked'\) : '';/);
assert.match(read('src/web/server/render/web_admin_scripts.cpp'), /appendJsEntry\("folderTypeLocked", tr\.js_folder_type_locked\);/);
const i18n = read('src/core/i18n/i18n.cpp');
for (const text of ['Der Ordner enthält noch Kacheln. Löschen geht über „Löschen“.', 'The folder still contains tiles. Remove it with “Delete”.',
  'Le dossier contient encore des tuiles.', 'Folder nadal zawiera kafelki. Usuń go przyciskiem „Usuń”.']) {
  assert.ok(i18n.includes(text), text);
}
console.log('Folder deletion: only after a question, never by a type change');
