#pragma once

#include <Arduino.h>

// A scene, script or button entity id ("button.wolf_..."), as a Scene tile
// stores one picked in the entity picker; a Bridge alias has no such prefix.
// The domains are the Bridge's ACTION_DOMAINS (control_helpers.py).
static inline bool sceneTargetIsEntityId(const String& value) {
  return value.startsWith("scene.") || value.startsWith("script.") || value.startsWith("button.") ||
         value.startsWith("input_button.");
}
