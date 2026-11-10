#pragma once

// The audio chips a speaker board can name in its speaker_board.h. The
// shared core (src/audio/audio_board.cpp) drives each one the same way on
// every board; a new board only names its chips, addresses and pins.

#include <stdint.h>

namespace audio_chips {

// Playback codec (DAC) behind the speaker amplifier.
enum class Output : uint8_t {
  Es8311,  // Everest ES8311 mono codec
  Es8388,  // Everest ES8388 stereo codec (M5Stack Tab5)
};

// Microphone path.
enum class Input : uint8_t {
  None,    // no microphone
  Es7210,  // Everest ES7210 4-channel ADC: MIC1/MIC2 on SDOUT1
  Es8311,  // the ES8311 output codec's own ADC: one analog mic on MIC1
};

}  // namespace audio_chips
