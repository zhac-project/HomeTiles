#include "src/audio/speaker_select.h"

#if defined(DEVICE_GUITION_JC8012P4A1_V2) && defined(HOMETILES_SPEAKER)

#include "src/devices/guition_jc8012p4a1_v2/speaker_board.h"

#include "src/devices/guition_jc8012p4a1_v2/vendor/gsl3680_touch.h"

namespace speaker_board {

i2c_master_bus_handle_t bus() { return gsl3680_i2c_bus(); }

}  // namespace speaker_board

#endif  // defined(DEVICE_GUITION_JC8012P4A1_V2) && defined(HOMETILES_SPEAKER)
