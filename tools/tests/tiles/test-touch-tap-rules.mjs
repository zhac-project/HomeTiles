// Host-compiled test of touch_rules::far_from_tap (src/ui/shared/touch_rules.h):
// when a finger that moved is no tap any more. User 2026-10-13: a tap on a
// page whose finger rolled 20 px down was swallowed ("[Touch] No tap: the
// finger moved -1,20 px" on the V2); a page only turns sideways, so only a
// sideways move counts at the tap's distance there. The cases below are the
// moves of the V2 and S3 logs of that day.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const tempRoot = mkdtempSync(join(tmpdir(), "hometiles-touch-rules-"));

// popup_layout.h pulls in LVGL; the stub keeps only its real scale().
const layout = readFileSync(join(repoRoot, "src/ui/popups/popup_layout.h"), "utf8");
const scale = layout.match(/constexpr int scale\(int value\) \{[\s\S]*?\n\}/);
assert.ok(scale, "popup_layout::scale found");
mkdirSync(join(tempRoot, "src/ui/popups"), { recursive: true });
writeFileSync(join(tempRoot, "src/ui/popups/popup_layout.h"),
  `#pragma once\nnamespace popup_layout {\n${scale[0]}\n}  // namespace popup_layout\n`, "utf8");

const source = String.raw`
#include "src/ui/shared/touch_rules.h"

#include <assert.h>

using touch_rules::far_from_tap;

int main() {
#if defined(DEVICE_LAYOUT_480X480)
  static_assert(touch_rules::kTapSlop == 13 && touch_rules::kSwipeDistance == 32, "S3 distances");
  // S3 log: a sideways move of 16 px on a page is the start of a turn.
  assert(far_from_tap(-16, 3, true, false));
  // A finger rolling 20 px down on a page is still a tap.
  assert(!far_from_tap(0, 20, true, false));
  // S3 log: the Home swipe up is none.
  assert(far_from_tap(-84, -191, true, true));
#else
  static_assert(touch_rules::kTapSlop == 20 && touch_rules::kSwipeDistance == 48, "V2 distances");
  // V2 log: the swallowed tap on a page (finger rolled 20 px down).
  assert(!far_from_tap(-1, 20, true, false));
  assert(!far_from_tap(0, 47, true, false));
  // Further than a swipe any way is none.
  assert(far_from_tap(0, 49, true, false));
  assert(far_from_tap(35, 35, false, false));
  assert(!far_from_tap(30, 30, false, false));
  // V2 log: a swipe of -51,67 in a folder is none.
  assert(far_from_tap(-51, 67, false, false));
  // Sideways counts at the tap's distance where the page turns or a side
  // edge's swipe is armed, not in a folder without either.
  assert(!far_from_tap(-20, 0, true, false));
  assert(far_from_tap(-21, 0, true, false));
  assert(far_from_tap(21, 0, true, false));
  assert(!far_from_tap(-21, 0, false, false));
  // Up and down count at it where a top or bottom edge's swipe is armed.
  assert(far_from_tap(0, -21, false, true));
  assert(far_from_tap(0, 21, false, true));
  assert(!far_from_tap(21, 0, false, true));
#endif
  return 0;
}
`;

function findCompiler() {
  const candidates = [process.env.CXX, "clang++", "g++", "c++"].filter(Boolean);
  for (const candidate of candidates) {
    const check = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!check.error && check.status === 0) return candidate;
  }
  return null;
}

try {
  const compiler = findCompiler();
  if (!compiler) {
    console.log("SKIP: no C++ compiler for the touch rules test");
  } else {
    const sourcePath = join(tempRoot, "touch_rules_test.cpp");
    writeFileSync(sourcePath, source, "utf8");
    for (const define of [[], ["-DDEVICE_LAYOUT_480X480"]]) {
      const outputPath = join(tempRoot, `touch_rules_test${define.length ? "_s3" : ""}${process.platform === "win32" ? ".exe" : ""}`);
      // The stub comes before the repository, so the header finds it.
      const compile = spawnSync(compiler,
        ["-std=c++17", "-Wall", "-Wextra", "-Werror", ...define, "-I", tempRoot, "-I", repoRoot, sourcePath, "-o", outputPath],
        { encoding: "utf8" });
      assert.equal(compile.status, 0, `touch rules test did not compile:\n${compile.stdout}${compile.stderr}`);
      const run = spawnSync(outputPath, [], { encoding: "utf8" });
      assert.equal(run.status, 0, `touch rules test failed (${define.join(" ") || "V2"}):\n${run.stdout}${run.stderr}`);
    }
    console.log("touch rules: a tap stays a tap unless it moved the way a swipe starts");
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
