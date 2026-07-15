import { Platform, StyleSheet, TextInput, type TextInputProps } from "react-native";

import { parchmentBorder, parchmentField, parchmentGeometry, parchmentInk, parchmentPlaceholder } from "../../constants/parchmentTokens";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

/** Minimum font size to prevent iOS Safari zoom-on-focus (also required by the redesign spec). */
export const PARCHMENT_FIELD_MIN_FONT_SIZE = 16;

/**
 * The one shared text-entry surface — inputs, textareas, journal responses, check-in answers,
 * checklist titles, goal/path fields, food/routine editors. Presentation only: forwards every
 * prop straight to TextInput (value/onChangeText/keyboard type/multiline/etc.), so existing
 * validation, focus, and save-handler wiring keeps working unchanged.
 */
export function ParchmentField({ style, placeholderTextColor, multiline, ...rest }: TextInputProps) {
  return (
    <TextInput
      style={[multiline ? styles.textArea : styles.input, style]}
      placeholderTextColor={placeholderTextColor ?? parchmentPlaceholder}
      multiline={multiline}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: parchmentField,
    borderWidth: parchmentGeometry.fieldBorderWidth,
    borderColor: parchmentBorder,
    borderRadius: parchmentGeometry.fieldRadius,
    color: parchmentInk,
    fontFamily: pixelFont,
    fontSize: PARCHMENT_FIELD_MIN_FONT_SIZE,
    fontWeight: "800",
    padding: 12,
  },
  textArea: {
    backgroundColor: parchmentField,
    borderWidth: parchmentGeometry.fieldBorderWidth,
    borderColor: parchmentBorder,
    borderRadius: parchmentGeometry.fieldRadius,
    color: parchmentInk,
    fontFamily: pixelFont,
    fontSize: PARCHMENT_FIELD_MIN_FONT_SIZE,
    fontWeight: "800",
    lineHeight: 22,
    minHeight: 100,
    padding: 12,
    textAlignVertical: "top",
  },
});
