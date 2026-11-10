#pragma once

// Frame-time bench for the background speed gate. Diagnostic builds only:
//   EXTRA_FLAGS=-DHOMETILES_BENCH_FRAMES tools/build-profile.sh <profile> <out>
// Logs [BENCH] lines on the serial port; default builds compile to nothing.
namespace frame_bench {
#if defined(HOMETILES_BENCH_FRAMES)
void begin();
void folder_open_requested();
#else
inline void begin() {}
inline void folder_open_requested() {}
#endif
}  // namespace frame_bench
