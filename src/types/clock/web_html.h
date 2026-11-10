#pragma once

#include <Arduino.h>

void append_clock_fields_html(String& html, const String& tab_id);
// The date formats of the clock tile and the screensaver clock (one list).
void append_clock_date_format_options(String& html, const char* language);
