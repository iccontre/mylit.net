import { Platform, StyleSheet } from "react-native";

import { parchmentBorder, parchmentField, parchmentGeometry, parchmentInk } from "./parchmentTokens";

/** Minimum font size to prevent iOS Safari zoom-on-focus. */
export const FORM_INPUT_FONT_SIZE = 16;

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

/** Page content wrapper for form screens — full width, no fixed height. */
export const formPageContent = {
  flexGrow: 1,
  width: "100%" as const,
  alignSelf: "stretch" as const,
  paddingTop: 18,
  paddingHorizontal: 14,
};

export const formStyles = StyleSheet.create({
  input: {
    backgroundColor: parchmentField,
    borderWidth: parchmentGeometry.fieldBorderWidth,
    borderColor: parchmentBorder,
    borderRadius: parchmentGeometry.fieldRadius,
    color: parchmentInk,
    fontFamily: pixelFont,
    fontSize: FORM_INPUT_FONT_SIZE,
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
    fontSize: FORM_INPUT_FONT_SIZE,
    fontWeight: "800",
    lineHeight: 22,
    minHeight: 120,
    maxHeight: 240,
    padding: 12,
    textAlignVertical: "top",
  },
});
