#include "src/ui/shared/tabular_digits.h"

namespace tabular_digits {
namespace {

struct Copy {
  lv_font_t font;
  const lv_font_t* base;
  uint16_t advance;
  // The wider of A and P (AM / PM).
  uint16_t meridiem;
};

// Clock, screensaver and head bar sizes (ui_fonts: 20 to 96).
constexpr int kMaxCopies = 16;
Copy g_copies[kMaxCopies];
int g_count = 0;

bool is_digit(uint32_t letter) { return letter >= '0' && letter <= '9'; }

// The A or P of "AM" / "PM" (the 12-hour clock). Only before an M: other
// words keep their letters.
bool is_meridiem(uint32_t letter, uint32_t letter_next) {
  return (letter == 'A' || letter == 'P') && letter_next == 'M';
}

// The base font's own lookup on the copy (same descriptor data), then every
// digit widened to the widest digit's advance and centered in it; A and P
// before M take the wider one's advance, so the time keeps its width from
// AM to PM (user 2026-10-12: the text jumped at noon).
bool glyph_dsc(const lv_font_t* font, lv_font_glyph_dsc_t* dsc, uint32_t letter, uint32_t letter_next) {
  const Copy* copy = static_cast<const Copy*>(font->user_data);
  const bool digit = is_digit(letter);
  const bool meridiem = is_meridiem(letter, letter_next);
  if (!copy->base->get_glyph_dsc(font, dsc, letter, digit || meridiem || is_digit(letter_next) ? 0 : letter_next)) {
    return false;
  }
  const uint16_t advance = digit ? copy->advance : meridiem ? copy->meridiem : 0;
  if (dsc->adv_w < advance) {
    dsc->ofs_x = static_cast<int16_t>(dsc->ofs_x + (advance - dsc->adv_w) / 2);
    dsc->adv_w = advance;
  }
  return true;
}

}  // namespace

const lv_font_t* font(const lv_font_t* base) {
  if (!base || !base->get_glyph_dsc) return base;
  for (int i = 0; i < g_count; ++i) {
    if (g_copies[i].base == base) return &g_copies[i].font;
  }
  if (g_count >= kMaxCopies) return base;
  uint16_t advance = 0;
  for (uint32_t letter = '0'; letter <= '9'; ++letter) {
    lv_font_glyph_dsc_t dsc{};
    if (base->get_glyph_dsc(base, &dsc, letter, 0) && dsc.adv_w > advance) advance = dsc.adv_w;
  }
  if (!advance) return base;
  uint16_t meridiem = 0;
  const uint32_t meridiem_letters[] = {'A', 'P'};
  for (uint32_t letter : meridiem_letters) {
    lv_font_glyph_dsc_t dsc{};
    if (base->get_glyph_dsc(base, &dsc, letter, 0) && dsc.adv_w > meridiem) meridiem = dsc.adv_w;
  }
  Copy& copy = g_copies[g_count++];
  copy.font = *base;
  copy.base = base;
  copy.advance = advance;
  copy.meridiem = meridiem;
  copy.font.get_glyph_dsc = glyph_dsc;
  copy.font.user_data = &copy;
  return &copy.font;
}

}  // namespace tabular_digits
