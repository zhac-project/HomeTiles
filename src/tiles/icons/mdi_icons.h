#ifndef MDI_ICONS_H
#define MDI_ICONS_H

#include <Arduino.h>
#include <lvgl.h>

#include "src/devices/device_select.h"
#include "src/tiles/icons/mdi_icon_loader.h"

// One icon size per layout. The font's bitmaps beyond the built-in core icons
// come from the icon file through MDI_ICON_LOADER (mdi_icon_store.h).
#if defined(DEVICE_LAYOUT_1024X600)
extern const lv_font_t mdi_icons_40;
extern mdi_icon_loader_t mdi_icons_40_loader;
#define FONT_MDI_ICONS (&mdi_icons_40)
#define MDI_ICON_LOADER (&mdi_icons_40_loader)
#elif defined(DEVICE_LAYOUT_480X480)
extern const lv_font_t mdi_icons_32;
extern mdi_icon_loader_t mdi_icons_32_loader;
#define FONT_MDI_ICONS (&mdi_icons_32)
#define MDI_ICON_LOADER (&mdi_icons_32_loader)
#else
extern const lv_font_t mdi_icons_48;
extern mdi_icon_loader_t mdi_icons_48_loader;
#define FONT_MDI_ICONS (&mdi_icons_48)
#define MDI_ICON_LOADER (&mdi_icons_48_loader)
#endif

// Maps an icon name to its Unicode codepoint, for example
// "home" -> 0xF02DC.
uint32_t getMdiCodepoint(const String& iconName);

// Returns true if icon name explicitly disables icon rendering (e.g. "-", "none").
bool isMdiIconDisabled(const String& iconName);

// Normalizes MDI icon names (lowercase, trim, strip mdi: prefix, honor disable token).
String normalizeMdiIconName(const String& iconName);

// The codepoint shown for an unknown icon name; a built-in core icon.
uint32_t mdiUnknownIconCodepoint();

// Returns the Unicode character as a String, for lv_label_set_text().
String getMdiChar(const String& iconName);

// The supported icon names in lexical order, for the Web Admin icon picker.
size_t mdiIconCount();
const char* mdiIconName(size_t index);

#endif // MDI_ICONS_H
