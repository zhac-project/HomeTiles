// Host-compiled unit test for src/ui/background/jpeg_probe.h. The background
// photo list probes every JPEG on the microSD card, so the probe must classify
// baseline/progressive files, read the EXIF orientation, and stay bounded on
// damaged headers or a card that disappears mid-read.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const tempRoot = mkdtempSync(join(tmpdir(), "hometiles-jpeg-probe-"));
const sourcePath = join(tempRoot, "jpeg_probe_test.cpp");
const outputPath = join(
  tempRoot,
  process.platform === "win32" ? "jpeg_probe_test.exe" : "jpeg_probe_test",
);

const source = String.raw`
#include "src/ui/background/jpeg_probe.h"

#include <assert.h>
#include <stdint.h>
#include <stdio.h>

#include <initializer_list>
#include <vector>

using jpeg_probe::Info;
using jpeg_probe::Kind;
using Bytes = std::vector<uint8_t>;

// Serves a byte vector as a file of file_size bytes and records every read.
struct Reader {
  const Bytes* data = nullptr;
  uint32_t file_size = 0;
  uint32_t fail_from = UINT32_MAX;  // reads at or past this offset fail (card pulled)
  size_t calls = 0;
  size_t bytes = 0;
  bool past_end = false;
  std::vector<uint32_t> offsets;
  std::vector<size_t> lengths;

  size_t operator()(uint32_t offset, uint8_t* dst, size_t len) {
    ++calls;
    offsets.push_back(offset);
    lengths.push_back(len);
    if (static_cast<uint64_t>(offset) + len > file_size) past_end = true;
    if (offset >= fail_from || offset >= data->size()) return 0;
    size_t n = len;
    if (offset + n > data->size()) n = data->size() - offset;
    for (size_t i = 0; i < n; ++i) dst[i] = (*data)[offset + i];
    bytes += n;
    return n;
  }
};

static Bytes jpeg(std::initializer_list<Bytes> segments) {
  Bytes out = {0xFF, 0xD8};
  for (const Bytes& s : segments) out.insert(out.end(), s.begin(), s.end());
  return out;
}
static Bytes seg(uint8_t marker, const Bytes& payload) {
  const size_t len = payload.size() + 2;
  Bytes out = {0xFF, marker, static_cast<uint8_t>(len >> 8), static_cast<uint8_t>(len)};
  out.insert(out.end(), payload.begin(), payload.end());
  return out;
}
static Bytes app0() {
  return seg(0xE0, {'J', 'F', 'I', 'F', 0, 1, 1, 0, 0, 1, 0, 1, 0, 0});
}
static Bytes app(uint8_t marker, size_t n) { return seg(marker, Bytes(n, 0)); }
static Bytes sof(uint8_t marker, uint16_t w, uint16_t h) {
  return seg(marker, {8, static_cast<uint8_t>(h >> 8), static_cast<uint8_t>(h),
                      static_cast<uint8_t>(w >> 8), static_cast<uint8_t>(w), 3,
                      1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1});
}
static Bytes raw_len(uint8_t marker, uint16_t len) {
  return {0xFF, marker, static_cast<uint8_t>(len >> 8), static_cast<uint8_t>(len)};
}
static Bytes sos() { return seg(0xDA, {1, 1, 0, 0, 63, 0}); }
static Bytes eoi() { return {0xFF, 0xD9}; }
static Bytes fill(size_t n) { return Bytes(n, 0xFF); }
static Bytes repeat(const Bytes& part, size_t n) {
  Bytes out;
  for (size_t i = 0; i < n; ++i) out.insert(out.end(), part.begin(), part.end());
  return out;
}

static void put16(Bytes& out, uint16_t v, bool le) {
  if (le) { out.push_back(v & 0xFF); out.push_back(v >> 8); }
  else { out.push_back(v >> 8); out.push_back(v & 0xFF); }
}
static void put32(Bytes& out, uint32_t v, bool le) {
  if (le) { put16(out, v & 0xFFFF, true); put16(out, v >> 16, true); }
  else { put16(out, v >> 16, false); put16(out, v & 0xFFFF, false); }
}
// APP1 "Exif" payload whose IFD0 holds Make, Orientation (type, value) and one
// more tag, padded to pad_to bytes.
static Bytes exif_payload(bool le, uint16_t type, uint32_t value, uint32_t ifd_offset = 8,
                          size_t pad_to = 0) {
  Bytes p = {'E', 'x', 'i', 'f', 0, 0};
  if (le) { p.push_back('I'); p.push_back('I'); } else { p.push_back('M'); p.push_back('M'); }
  put16(p, 0x2A, le);
  put32(p, ifd_offset, le);
  put16(p, 3, le);
  const uint16_t tags[3] = {0x010F, 0x0112, 0x011A};
  for (uint16_t tag : tags) {
    put16(p, tag, le);
    if (tag == 0x0112) {
      put16(p, type, le);
      put32(p, 1, le);
      if (type == 3) { put16(p, static_cast<uint16_t>(value), le); put16(p, 0, le); }
      else put32(p, value, le);
    } else {
      put16(p, 4, le); put32(p, 1, le); put32(p, 0, le);
    }
  }
  put32(p, 0, le);
  if (p.size() < pad_to) p.resize(pad_to, 0);
  return p;
}
static Bytes exif(const char* order, uint16_t type, uint32_t value) {
  return seg(0xE1, exif_payload(order[0] == 'I', type, value));
}

static Info probe_with(Reader& r, const Bytes& file, bool want_orientation,
                       uint32_t file_size = 0) {
  r.data = &file;
  r.file_size = file_size ? file_size : static_cast<uint32_t>(file.size());
  Info info = jpeg_probe::probe(r, r.file_size, want_orientation);
  assert(!r.past_end);
  return info;
}
static Info probe_of(const Bytes& file, bool want_orientation = false) {
  Reader r;
  return probe_with(r, file, want_orientation);
}
static Kind kind_of(const Bytes& file) { return probe_of(file).kind; }
static uint8_t orientation_of(const Bytes& file) { return probe_of(file, true).orientation; }
static Kind kind_of_reading_zero_from(const Bytes& file, uint32_t offset) {
  Reader r;
  r.fail_from = offset;
  return probe_with(r, file, true).kind;
}

int main() {
  const Info base = probe_of(jpeg({app0(), sof(0xC0, 800, 480)}));
  assert(base.kind == Kind::Baseline && base.width == 800 && base.height == 480 &&
         base.orientation == 1);

  for (uint8_t m : {0xC2, 0xC6, 0xCA, 0xCE}) {
    assert(kind_of(jpeg({sof(m, 640, 480)})) == Kind::Progressive);
  }
  for (uint8_t m : {0xC1, 0xC3, 0xC5, 0xC7, 0xC9, 0xCB, 0xCD, 0xCF}) {
    assert(kind_of(jpeg({sof(m, 640, 480)})) == Kind::Unsupported);
  }

  assert(kind_of(Bytes{0x89, 0x50, 0x4E, 0x47}) == Kind::Unsupported);  // PNG
  assert(kind_of(Bytes{}) == Kind::Unsupported);
  assert(kind_of(jpeg({sos(), sof(0xC0, 8, 8)})) == Kind::Unsupported);
  assert(kind_of(jpeg({eoi(), sof(0xC0, 8, 8)})) == Kind::Unsupported);
  assert(kind_of(jpeg({raw_len(0xE0, 0), sof(0xC0, 8, 8)})) == Kind::Unsupported);
  assert(kind_of(jpeg({raw_len(0xE0, 1), sof(0xC0, 8, 8)})) == Kind::Unsupported);
  assert(kind_of(jpeg({raw_len(0xE0, 60000)})) == Kind::Unsupported);  // past EOF

  assert(kind_of(jpeg({repeat(app(0xE2, 4), 63), sof(0xC0, 8, 8)})) == Kind::Baseline);
  assert(kind_of(jpeg({repeat(app(0xE2, 4), 65), sof(0xC0, 8, 8)})) == Kind::Unsupported);

  assert(kind_of(jpeg({fill(3), sof(0xC0, 8, 8)})) == Kind::Baseline);
  assert(kind_of(jpeg({fill(40), sof(0xC0, 8, 8)})) == Kind::Unsupported);
  assert(kind_of(jpeg({sof(0xC0, 0, 480)})) == Kind::Unsupported);
  assert(kind_of(jpeg({sof(0xC0, 640, 0)})) == Kind::Unsupported);

  // The card disappears after the first marker.
  assert(kind_of_reading_zero_from(jpeg({app0(), sof(0xC0, 8, 8)}), 6) == Kind::Unsupported);

  assert(orientation_of(jpeg({exif("II", 3, 6), sof(0xC0, 8, 8)})) == 6);
  assert(orientation_of(jpeg({exif("MM", 3, 8), sof(0xC0, 8, 8)})) == 8);
  assert(orientation_of(jpeg({exif("II", 4, 6), sof(0xC0, 8, 8)})) == 1);  // LONG
  assert(orientation_of(jpeg({exif("II", 3, 9), sof(0xC0, 8, 8)})) == 1);
  assert(orientation_of(jpeg({exif("II", 3, 0), sof(0xC0, 8, 8)})) == 1);
  assert(orientation_of(jpeg({seg(0xE1, exif_payload(true, 3, 6, 0xFFFF0000u)),
                              sof(0xC0, 8, 8)})) == 1);
  // XMP APP1 first, Exif second.
  assert(orientation_of(jpeg({seg(0xE1, Bytes{'h', 't', 't', 'p', ':', '/', '/'}),
                              exif("II", 3, 3), sof(0xC0, 8, 8)})) == 3);

  {
    // A 65535-byte APP1 in a 2 KB file ends past EOF.
    Bytes file = jpeg({raw_len(0xE1, 65535)});
    file.resize(2048, 0);
    Reader r;
    assert(probe_with(r, file, true).kind == Kind::Unsupported);
  }
  {
    // A 30,000-byte APP1 (thumbnail) is read only within its first 4096 bytes.
    const Bytes file = jpeg({seg(0xE1, exif_payload(true, 3, 6, 8, 30000)), sof(0xC0, 8, 8)});
    Reader r;
    const Info info = probe_with(r, file, true);
    assert(info.kind == Kind::Baseline && info.orientation == 6);
    assert(r.bytes <= 4096 + 64);
  }
  {
    // Without want_orientation the APP1 payload is never read.
    const Bytes file = jpeg({exif("II", 3, 6), sof(0xC0, 8, 8)});
    Reader r;
    const Info info = probe_with(r, file, false);
    assert(info.kind == Kind::Baseline && info.orientation == 1);
    const uint32_t payload_start = 2 + 4;
    const uint32_t payload_end = 2 + static_cast<uint32_t>(exif("II", 3, 6).size());
    for (size_t i = 0; i < r.offsets.size(); ++i) {
      assert(r.offsets[i] + r.lengths[i] <= payload_start || r.offsets[i] >= payload_end);
    }
  }
  {
    // A large photo costs a few small reads.
    const Bytes head = jpeg({app0(), sof(0xC0, 4000, 3000)});
    Reader r;
    const Info info = probe_with(r, head, false, 5u * 1024u * 1024u);
    assert(info.kind == Kind::Baseline && info.width == 4000 && info.height == 3000);
    assert(r.calls < 8 && r.bytes < 64);
  }

  puts("jpeg_probe host test: PASS");
  return 0;
}
`;

function findCompiler() {
  const candidates = [process.env.CXX, "clang++", "g++", "c++"].filter(Boolean);
  for (const candidate of candidates) {
    const check = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!check.error && check.status === 0) return candidate;
  }
  throw new Error("No C++ compiler found for the JPEG probe test");
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
    `JPEG probe test did not compile:\n${compile.stdout}${compile.stderr}`);
  const run = spawnSync(outputPath, [], { encoding: "utf8" });
  assert.equal(run.status, 0, `JPEG probe test failed:\n${run.stdout}${run.stderr}`);
  console.log(run.stdout.trim());
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
