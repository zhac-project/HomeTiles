#!/usr/bin/env bash
# Local build of one sketch.yaml profile with the CI compile flags, followed by
# the checks CI applies to its images:
# - the image must fit the smallest app slot of the generated partition table.
#   arduino-cli checks "PartitionScheme=custom" profiles only against the
#   whole flash, so an image that cannot be installed over the air would
#   otherwise build without an error;
# - ESP32-P4 images must contain the ESP-Hosted fixes of
#   tools/esp-hosted-3.3.7-{rx,tx}-fix, S3 images the update diagnostics.
#
#   tools/build-profile.sh <profile> <output-dir>          compile, then check
#   tools/build-profile.sh --check <profile> <output-dir>  check an existing build
#
# The compile uses --profile, so the profile's pinned core and libraries apply.
# On ESP32-P4 that core's libespressif__esp_hosted.a must already carry the
# fixed objects, as in the "Apply target-specific ESP-Hosted 3.3.7 fixes" step
# of .github/workflows/firmware.yml.
#
# Environment: ARDUINO_CLI (arduino-cli), ARDUINO_CLI_CONFIG (--config-file),
# ARDUINO_LIBRARIES (~/Arduino/libraries), BUILD_PATH (--build-path), JOBS (4).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
check_only=0
if [ "${1:-}" = "--check" ]; then
  check_only=1
  shift
fi
if [ $# -ne 2 ]; then
  echo "usage: $0 [--check] <profile> <output-dir>" >&2
  exit 2
fi
profile="$1"
out="$2"
fail() {
  echo "$profile: $*" >&2
  exit 1
}

fields="$(node -e '
  const profile = require(process.argv[1]).profiles.find(p => p.buildProfile === process.argv[2]);
  if (profile) console.log([profile.define, profile.rxVariant, profile.elfFlags].join("|"));
' "$root/tools/device-profiles.json" "$profile")"
[ -n "$fields" ] || fail "not in tools/device-profiles.json"
IFS='|' read -r define rx_variant elf_flags <<<"$fields"

if [ "$check_only" = 0 ]; then
  read -r -a cli <<<"${ARDUINO_CLI:-arduino-cli}"
  if [ -n "${ARDUINO_CLI_CONFIG:-}" ]; then cli+=(--config-file "$ARDUINO_CLI_CONFIG"); fi
  common="-DHOMETILES_CI_TARGET -D$define -DLV_CONF_INCLUDE_SIMPLE -I$root -I${ARDUINO_LIBRARIES:-$HOME/Arduino/libraries}"
  # As in firmware.yml: repeat the core's C++ flags and append -fno-exceptions.
  cpp_flags='-MMD -c "@{compiler.sdk.path}/flags/cpp_flags" {compiler.warning_flags} {compiler.optimization_flags} {compiler.common_werror_flags}'
  core_flags="$("${cli[@]}" compile --profile "$profile" --show-properties=unexpanded "$root" |
    sed -n 's/^compiler\.cpp\.flags=//p')"
  [ "$core_flags" = "$cpp_flags" ] || fail "compiler.cpp.flags of the core changed; update the -fno-exceptions override"
  args=(--profile "$profile" --jobs "${JOBS:-4}" --output-dir "$out")
  if [ -n "${BUILD_PATH:-}" ]; then args+=(--build-path "$BUILD_PATH"); fi
  "${cli[@]}" compile "${args[@]}" \
    --build-property "compiler.c.extra_flags=$common" \
    --build-property "compiler.cpp.extra_flags=$common" \
    --build-property "compiler.cpp.flags=$cpp_flags -fno-exceptions" \
    --build-property "compiler.c.elf.extra_flags=$elf_flags" \
    "$root"
fi

bin="$out/HomeTiles.ino.bin"
[ -f "$bin" ] || fail "$bin is missing"
size="$(wc -c <"$bin")"
# Smallest app partition (type 0) of the table that is flashed with the image.
slot="$(node -e '
  const table = require("fs").readFileSync(process.argv[1]);
  const apps = [];
  for (let at = 0; at + 32 <= table.length && table.readUInt16LE(at) === 0x50aa; at += 32) {
    if (table[at + 2] === 0) apps.push(table.readUInt32LE(at + 8));
  }
  if (apps.length) console.log(Math.min(...apps));
' "$out/HomeTiles.ino.partitions.bin")"
[ -n "$slot" ] || fail "no app partition in $out/HomeTiles.ino.partitions.bin"
[ "$size" -le "$slot" ] || fail "image is $size bytes, larger than its $slot-byte app slot"

# The image checks of firmware.yml (its map-file check aside).
if [ "$rx_variant" != "native-s3" ]; then
  for stock_assert in copy_buff pkt_rxbuff; do
    if grep -a -q "$stock_assert" "$bin"; then fail "stock ESP-Hosted assert '$stock_assert' in the image"; fi
  done
  grep -a -F -q "HomeTiles RPC sync serialization active" "$bin" || fail "ESP-Hosted RPC serialization fix missing"
  grep -a -F -q "HomeTiles SDIO RX recovery active (a8204f9 raw PKT_LEN + pending drain)" "$bin" ||
    fail "ESP-Hosted SDIO RX recovery fix missing"
  if grep -a -F -q "HomeTiles SDIO RX 512-byte padding disabled (CMD53 short tail, 4-byte aligned)" "$bin"; then
    fail "unexpected short-tail RX patch"
  fi
  single_block="HomeTiles Issue30 RX single-block workaround active: max_blocks_per_CMD53=1"
  if [ "$rx_variant" = "repo-guition-jc8012-rx-single-block" ]; then
    grep -a -F -q "$single_block" "$bin" || fail "JC8012 single-block RX patch missing"
  elif grep -a -F -q "$single_block" "$bin"; then
    fail "unexpected JC8012 single-block RX patch"
  fi
  if grep -a -F -q "PKT_LEN reg all-ones (bus read error); dropping read" "$bin"; then
    fail "obsolete masked PKT_LEN drop path"
  fi
else
  grep -a -F -q "HTTPS host=%s tls=%d (%s) allocator=%s" "$bin" || fail "S3 update diagnostics missing"
fi

echo "$profile: image $size bytes, app slot $slot bytes, $((slot - size)) bytes free"
