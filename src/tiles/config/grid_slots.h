#pragma once

// A folder's tile list against its classic grid (tile_config.h). The list
// holds one entry per classic cell plus as many again for the layouts'
// storage (Ablage), so tiles kept there never take the entry a free cell
// needs (user 2026-10-16, 4B: 8 tiles on the 3x3 head bar screen, 7 in the
// storage and the Back tile used all 16 entries; no new tile could go on the
// free cell). At most 64 entries: the switch and binary sensor update queues
// mark tiles in 64-bit masks. Pure, host-tested.

#include <stddef.h>

namespace grid_slots {

constexpr size_t kMaxEntries = 64;

constexpr size_t capacity(size_t cells) {
  return cells >= kMaxEntries ? cells : (cells * 2 < kMaxEntries ? cells * 2 : kMaxEntries);
}

// The 4-tile blocks to read from a grid file of `bytes`: the full count, or
// the count a firmware from before the storage entries wrote (one entry per
// cell, exactly that size). 0 for any other size: a damaged file, so the
// caller tries its .tmp and .bak copies as before.
constexpr size_t readableQuarters(size_t bytes, size_t quarter_bytes, size_t full, size_t legacy) {
  return bytes >= full * quarter_bytes ? full
         : (legacy < full && bytes == legacy * quarter_bytes) ? legacy
                                                              : 0;
}

// The default cell of an empty entry: entries behind the classic cells start
// over at the first cell, so every default place lies on the grid.
constexpr size_t defaultCell(size_t index, size_t cells) { return cells ? index % cells : 0; }

}  // namespace grid_slots
