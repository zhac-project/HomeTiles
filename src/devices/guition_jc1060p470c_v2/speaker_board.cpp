#include "src/audio/speaker_select.h"

#if defined(DEVICE_GUITION_JC1060P470C_V2) && defined(HOMETILES_SPEAKER)

#include "src/devices/guition_jc1060p470c_v2/speaker_board.h"

#include "src/devices/guition_jc1060p470c_v2/device_guition_jc1060p470c_v2.h"

namespace speaker_board {

i2c_master_bus_handle_t bus() { return DeviceGuitionJC1060P470CV2::sharedI2cBus(); }

}  // namespace speaker_board

#endif  // defined(DEVICE_GUITION_JC1060P470C_V2) && defined(HOMETILES_SPEAKER)
