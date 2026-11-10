#pragma once

// Microphone level over a stretch of audio for the speaker log: peak and
// RMS of 16-bit samples in dBFS (0 = full scale). Shows whether a board's
// microphone gain suits the wake word. Pure, host-tested.

#include <math.h>
#include <stddef.h>
#include <stdint.h>

namespace mic_level {

// dBFS of a 16-bit magnitude; -96 for silence.
inline float toDbfs(double magnitude) {
  if (magnitude < 1.0) return -96.0f;
  return static_cast<float>(20.0 * log10(magnitude / 32768.0));
}

class Meter {
 public:
  void add(const int16_t* samples, size_t count) {
    for (size_t i = 0; i < count; ++i) {
      int32_t value = samples[i];
      if (value < 0) value = -value;
      if (static_cast<uint32_t>(value) > peak_) peak_ = static_cast<uint32_t>(value);
      sum_squares_ += static_cast<uint64_t>(value) * static_cast<uint64_t>(value);
    }
    count_ += count;
  }

  uint64_t samples() const { return count_; }
  float peakDbfs() const { return toDbfs(peak_); }
  float rmsDbfs() const {
    return count_ ? toDbfs(sqrt(static_cast<double>(sum_squares_) / static_cast<double>(count_)))
                  : -96.0f;
  }

  void reset() {
    peak_ = 0;
    sum_squares_ = 0;
    count_ = 0;
  }

 private:
  uint32_t peak_ = 0;
  uint64_t sum_squares_ = 0;
  uint64_t count_ = 0;
};

}  // namespace mic_level
