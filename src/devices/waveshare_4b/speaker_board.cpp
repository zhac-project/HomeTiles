#include "src/audio/speaker_select.h"

#if defined(DEVICE_WAVESHARE_4B) && defined(HOMETILES_SPEAKER)

#include "src/devices/waveshare_4b/speaker_board.h"

#include "src/devices/waveshare_4b/device_waveshare_4b.h"

namespace speaker_board {

i2c_master_bus_handle_t bus() { return DeviceWaveshare4B::sharedI2cBus(); }

}  // namespace speaker_board

#endif  // defined(DEVICE_WAVESHARE_4B) && defined(HOMETILES_SPEAKER)
