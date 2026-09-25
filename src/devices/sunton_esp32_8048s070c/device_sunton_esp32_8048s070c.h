#pragma once

#include <FS.h>

#include "src/devices/device_types.h"

namespace DeviceSuntonESP328048S070C {

// Same 800x480 grid as the Waveshare Touch LCD 4.3 so layouts move between
// the two landscape 800x480 profiles unchanged.
inline constexpr Device::Profile kProfile{
    "sunton_esp32_8048s070c",
    "Sunton ESP32-8048S070C",
    800,
    480,
    5,
    4,
    10,
    3,
    150,
    111,
    4,
    // Not yet hardware-calibrated: the lowest raw PWM input treated as 1 %.
    20,
    Device::RotationStepMode::FlipOnly,
    0,
    2,
    Device::Capabilities{false, false, false, false, false, false},
    Device::kNoHardwareIoProfile,
};

bool init();
void update();

void displayPushPixels(int32_t x, int32_t y, int32_t w, int32_t h,
                       const uint16_t* data);
void displayPushPixelsDMA(int32_t x, int32_t y, int32_t w, int32_t h,
                          const uint16_t* data);
bool displayTryFullFramePreview(int32_t x, int32_t y, int32_t w, int32_t h,
                                int32_t source_stride,
                                const uint16_t* data, size_t data_size,
                                bool byte_swap);
// Prepare the inactive RGB framebuffer for one tear-free full-screen redraw.
// Normal partial UI updates continue to use the active framebuffer directly.
bool displayBeginAtomicFrame(const char* reason);
// Temporarily reduce RGB scanout bandwidth around the HTTPS version check.
void displayUpdateCheckGuardBegin();
void displayUpdateCheckGuardEnd();
void displayWaitDMA();
void displayFillScreen(uint16_t color);
void displaySetRotation(uint8_t rotation);

void setBrightness(uint8_t value);
uint8_t getBrightness();

bool getTouch(int16_t& x, int16_t& y);

void displaySleep();
void displayWake();
void displayWakeDark();
void displayPowerSaveOn();
void displayPowerSaveOff();
void displayWaitDisplay();
void prepareForRestart();

bool initSDCard();
bool storageReady();
fs::FS& storageFS();
void storageWriteBegin();
void storageWriteEnd();

bool sdReady();
fs::FS& sdFS();
bool suspendSDCardForNetworkTransition();
bool resumeSDCardAfterNetworkTransition();

bool initLittleFS();
void migrateStorageFromSD();

}  // namespace DeviceSuntonESP328048S070C
