#include "src/audio/speaker_select.h"

#if defined(DEVICE_GUITION_JC4880P443_PORTRAIT) && defined(HOMETILES_SPEAKER)

#include "src/devices/guition_jc4880p443_portrait/speaker_board.h"

#include "src/devices/guition_jc4880p443_portrait/device_guition_jc4880p443_portrait.h"

namespace speaker_board {

i2c_master_bus_handle_t bus() { return DeviceGuitionJC4880P443Portrait::sharedI2cBus(); }

}  // namespace speaker_board

#endif  // defined(DEVICE_GUITION_JC4880P443_PORTRAIT) && defined(HOMETILES_SPEAKER)
