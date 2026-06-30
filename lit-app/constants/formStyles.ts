import { Platform, StyleSheet } from "react-native";

/** Minimum font size to prevent iOS Safari zoom-on-focus. */
export const FORM_INPUT_FONT_SIZE = 16;

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

export const formStyles = StyleSheet.create({
  input: {
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderWidth: 2,
    borderColor: "#475569",
    borderRadius: 6,
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: FORM_INPUT_FONT_SIZE,
    fontWeight: "800",
    padding: 12,
  },
  textArea: {
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderWidth: 2,
    borderColor: "#475569",
    borderRadius: 6,
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
