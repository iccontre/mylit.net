import { Platform, StyleSheet } from "react-native";

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
    backgroundColor: "rgba(58, 42, 21, 0.92)",
    borderWidth: 2,
    borderColor: "#8B6B3D",
    borderRadius: 8,
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: FORM_INPUT_FONT_SIZE,
    fontWeight: "800",
    padding: 12,
  },
  textArea: {
    backgroundColor: "rgba(58, 42, 21, 0.92)",
    borderWidth: 2,
    borderColor: "#8B6B3D",
    borderRadius: 8,
    color: "#F9FAFB",
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
