#include "src/audio/speaker_select.h"

#if defined(DEVICE_WAVESHARE_TOUCH_LCD_8) && defined(HOMETILES_SPEAKER)

#include "src/devices/waveshare_touch_lcd_8/speaker_board.h"

#include "src/devices/waveshare_touch_lcd_8/device_waveshare_touch_lcd_8.h"

namespace speaker_board {

i2c_master_bus_handle_t bus() { return DeviceWaveshareTouchLCD8::sharedI2cBus(); }

}  // namespace speaker_board

#endif  // defined(DEVICE_WAVESHARE_TOUCH_LCD_8) && defined(HOMETILES_SPEAKER)
