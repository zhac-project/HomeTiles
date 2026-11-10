// Host-compiled unit test for src/ui/background/background_rules.h: which card
// files are listed, why a file can't be used, the stored-settings normalization,
// the slider clamps, the tile card opacity, and the pixel work done once per
// decoded background photo.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const tempRoot = mkdtempSync(join(tmpdir(), "hometiles-background-rules-"));
const sourcePath = join(tempRoot, "background_rules_test.cpp");
const outputPath = join(
  tempRoot,
  process.platform === "win32" ? "background_rules_test.exe" : "background_rules_test",
);

const source = String.raw`
#include "src/ui/background/background_rules.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

#include <algorithm>
#include <string>
#include <vector>

using namespace background_rules;
using jpeg_probe::Kind;

// A safe ".jpg" name of exactly n bytes.
static std::string jpg_name_of_bytes(size_t n) { return std::string(n - 4, 'a') + ".jpg"; }

static bool pixels_equal(std::vector<uint16_t> in, size_t dim, bool swap,
                         const std::vector<uint16_t>& expected) {
  finish_pixels(in.data(), in.size(), static_cast<uint8_t>(dim), swap);
  return in == expected;
}

static jpeg_probe::Info probed(Kind kind, uint16_t w, uint16_t h) {
  jpeg_probe::Info info;
  info.kind = kind;
  info.width = w;
  info.height = h;
  return info;
}

// normalize() on a stored photo field that may lack its NUL, as "photo|opacity|dim".
static std::string normalized(const char* photo, uint8_t opacity, uint8_t dim) {
  char field[kMaxPhotoName];
  memset(field, 'x', sizeof(field));
  memcpy(field, photo, std::min(strlen(photo) + 1, sizeof(field)));
  normalize(field, opacity, dim);
  return std::string(field) + "|" + std::to_string(opacity) + "|" + std::to_string(dim);
}

static std::vector<uint16_t> oriented(uint8_t orientation) {
  const uint16_t src[6] = {1, 2, 3, 4, 5, 6};  // 3x2
  std::vector<uint16_t> dst(6, 0);
  orient(src, 3, 2, orientation, dst.data());
  return dst;
}

int main() {
  assert(is_listed_name("a.jpg") && is_listed_name("B.JPEG") && is_listed_name("c.JpG"));
  assert(!is_listed_name(".a.jpg") && !is_listed_name("._a.jpg") && !is_listed_name("a.png") &&
         !is_listed_name(".jpg") && !is_listed_name("") && !is_listed_name(nullptr));

  assert(is_safe_name("Фото.jpg"));
  assert(is_safe_name(jpg_name_of_bytes(63).c_str()));
  assert(!is_safe_name(jpg_name_of_bytes(64).c_str()));
  assert(!is_safe_name("a..b.jpg") && !is_safe_name("a/b.jpg") && !is_safe_name("a\\b.jpg"));
  assert(!is_safe_name("") && !is_safe_name(nullptr) && !is_safe_name("a.png"));

  assert(reason_for("x.jpg", 100, Kind::Baseline) == Reason::Usable);
  assert(reason_for("x.jpg", 8u * 1024 * 1024, Kind::Baseline) == Reason::Usable);
  assert(reason_for("x.jpg", 8u * 1024 * 1024 + 1, Kind::Progressive) == Reason::TooBig);
  assert(reason_for("x..jpg", 9u * 1024 * 1024, Kind::Progressive) == Reason::BadName);
  assert(reason_for("x.jpg", 100, Kind::Progressive) == Reason::Progressive);
  assert(reason_for("x.jpg", 100, Kind::Unsupported) == Reason::Unreadable);

  // TJpgDec decodes every source pixel, so the source size bounds the decode.
  assert(kMaxSourcePixels == 2048u * 2048u);
  assert(reason_for("x.jpg", 100, probed(Kind::Baseline, 2048, 2048)) == Reason::Usable);
  assert(reason_for("x.jpg", 100, probed(Kind::Baseline, 2049, 2048)) == Reason::TooLarge);
  assert(reason_for("x.jpg", 100, probed(Kind::Baseline, 4000, 3000)) == Reason::TooLarge);
  assert(reason_for("x.jpg", 100, probed(Kind::Baseline, 65535, 65535)) == Reason::TooLarge);
  assert(reason_for("x.jpg", 100, probed(Kind::Progressive, 4000, 3000)) == Reason::Progressive);
  assert(reason_for("x.jpg", 9u * 1024 * 1024, probed(Kind::Baseline, 4000, 3000)) == Reason::TooBig);
  assert(reason_for("x..jpg", 100, probed(Kind::Baseline, 4000, 3000)) == Reason::BadName);
  assert(reason_for("x.jpg", 100, probed(Kind::Unsupported, 0, 0)) == Reason::Unreadable);

  // Stored settings as load and save() keep them.
  assert(normalized("a.jpg", 63, 27) == "a.jpg|65|25");
  assert(normalized("Фото.jpg", 200, 75) == "Фото.jpg|100|60");
  assert(normalized("a/b.jpg", 0, 0) == "|0|0");
  assert(normalized("a..b.jpg", 60, 25) == "|60|25");
  assert(normalized("a.png", 60, 25) == "|60|25");
  assert(normalized(std::string(kMaxPhotoName, 'a').c_str(), 60, 25) == "|60|25");
  // A field without its NUL ends at byte 63.
  assert(normalized((std::string(59, 'a') + ".jpgx").c_str(), 60, 25) == std::string(59, 'a') + ".jpg|60|25");

  assert(status_before_decode(false, false, false, Reason::BadName) == Status::None);
  assert(status_before_decode(true, false, true, Reason::Usable) == Status::NoCard);
  assert(status_before_decode(true, true, false, Reason::Usable) == Status::NotFound);
  assert(status_before_decode(true, true, true, Reason::Progressive) == Status::Unusable);
  assert(status_before_decode(true, true, true, Reason::Usable) == Status::Loading);

  std::vector<std::string> names = {"b.jpg", "IMG_2.jpg", "a.jpg", "img_10.jpg", "A.jpg"};
  std::sort(names.begin(), names.end(), [](const std::string& x, const std::string& y) {
    return compare_names(x.c_str(), y.c_str()) < 0;
  });
  assert((names == std::vector<std::string>{"A.jpg", "a.jpg", "b.jpg", "img_10.jpg", "IMG_2.jpg"}));
  assert(compare_names("a.jpg", "a.jpg") == 0);

  assert(clamp_opacity(62, 0) == 60 && clamp_opacity(63, 0) == 65 && clamp_opacity(-5, 0) == 0 &&
         clamp_opacity(130, 0) == 100 && clamp_opacity(20, 40) == 40);
  assert(clamp_dim(27) == 25 && clamp_dim(28) == 30 && clamp_dim(75) == 60 && clamp_dim(-1) == 0);

  assert(card_opa(255, 60) == 153 && card_pressed_opa(255, 60) == 204);
  assert(card_opa(255, 0) == 0 && card_pressed_opa(255, 0) == 127);
  assert(card_opa(255, 100) == 255 && card_pressed_opa(255, 100) == 255);
  assert(card_opa(0, 60) == 0 && card_pressed_opa(0, 60) == 0);

  assert(pixels_equal({0xFFFF}, 50, false, {0x8410}));
  assert(pixels_equal({0x00F8}, 60, true, {0x6000}));
  assert(pixels_equal({0x1234}, 0, true, {0x3412}));
  assert(pixels_equal({0x1234, 0xABCD}, 0, false, {0x1234, 0xABCD}));

  assert((oriented(1) == std::vector<uint16_t>{1, 2, 3, 4, 5, 6}));
  assert((oriented(2) == std::vector<uint16_t>{3, 2, 1, 6, 5, 4}));
  assert((oriented(3) == std::vector<uint16_t>{6, 5, 4, 3, 2, 1}));
  assert((oriented(4) == std::vector<uint16_t>{4, 5, 6, 1, 2, 3}));
  assert((oriented(5) == std::vector<uint16_t>{1, 4, 2, 5, 3, 6}));
  assert((oriented(6) == std::vector<uint16_t>{4, 1, 5, 2, 6, 3}));
  assert((oriented(7) == std::vector<uint16_t>{6, 3, 5, 2, 4, 1}));
  assert((oriented(8) == std::vector<uint16_t>{3, 6, 2, 5, 1, 4}));
  assert((oriented(0) == std::vector<uint16_t>{1, 2, 3, 4, 5, 6}));
  assert((oriented(9) == std::vector<uint16_t>{1, 2, 3, 4, 5, 6}));

  puts("background_rules host test: PASS");
  return 0;
}
`;

function findCompiler() {
  const candidates = [process.env.CXX, "clang++", "g++", "c++"].filter(Boolean);
  for (const candidate of candidates) {
    const check = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!check.error && check.status === 0) return candidate;
  }
  throw new Error("No C++ compiler found for the background rules test");
}

try {
  writeFileSync(sourcePath, source, "utf8");
  const compile = spawnSync(
    findCompiler(),
    ["-std=c++17", "-Wall", "-Wextra", "-Werror", "-I", repoRoot,
      sourcePath, "-o", outputPath],
    { encoding: "utf8" },
  );
  assert.equal(compile.status, 0,
    `Background rules test did not compile:\n${compile.stdout}${compile.stderr}`);
  const run = spawnSync(outputPath, [], { encoding: "utf8" });
  assert.equal(run.status, 0, `Background rules test failed:\n${run.stdout}${run.stderr}`);
  console.log(run.stdout.trim());
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
