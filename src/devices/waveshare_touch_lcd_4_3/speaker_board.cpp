#include "src/audio/speaker_select.h"

#if defined(DEVICE_WAVESHARE_TOUCH_LCD_4_3) && defined(HOMETILES_SPEAKER)

#include "src/devices/waveshare_touch_lcd_4_3/speaker_board.h"

#include "src/devices/waveshare_touch_lcd_4_3/device_waveshare_touch_lcd_4_3.h"

namespace speaker_board {

i2c_master_bus_handle_t bus() { return DeviceWaveshareTouchLCD4_3::sharedI2cBus(); }

}  // namespace speaker_board

#endif  // defined(DEVICE_WAVESHARE_TOUCH_LCD_4_3) && defined(HOMETILES_SPEAKER)
