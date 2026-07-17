import { Platform, StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from "react-native";

import { saveStates } from "../../constants/worldTokens";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

export type SaveState = "idle" | "saving" | "saved" | "error";

type SaveButtonProps = {
  state: SaveState;
  onPress: () => void;
  /** Idle label, e.g. "SAVE INTENTION" or "SAVE QUEST · +2 STEPS". Defaults to "SAVE". */
  idleLabel?: string;
  savingLabel?: string;
  savedLabel?: string;
  errorLabel?: string;
  /** Disables interaction (e.g. incomplete form) without switching to the error visual — stays
   *  idle-colored but non-interactive, distinct from an actual failed save. */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * The one shared Save button — every actual persistence Save/Create/Add control renders through
 * this so idle/saving/saved/error always look identical app-wide, matching the rendered "SAVE
 * FEEDBACK SEQUENCE" reference exactly: idle = green fill + gold ring, saving = dimmed wood +
 * hourglass, saved = brighter green + ✓ (never color alone), error = red + ⚠ + retry copy.
 * Callers own the actual persistence call and state transitions — this is presentation only.
 */
export function SaveButton({
  state,
  onPress,
  idleLabel = "SAVE",
  savingLabel = "SAVING…",
  savedLabel = "✓ SAVED",
  errorLabel = "⚠ SAVE FAILED — RETRY",
  disabled: disabledProp,
  style,
}: SaveButtonProps) {
  const tokens = saveStates[state];
  const disabled = disabledProp || state === "saving" || state === "saved";

  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: tokens.fill, borderColor: tokens.border }, disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={state === "idle" || state === "error" ? idleLabel : undefined}
    >
      <Text style={[styles.text, { color: tokens.text }]}>
        {state === "saving" ? `⏳ ${savingLabel}` : state === "saved" ? savedLabel : state === "error" ? errorLabel : idleLabel}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 3,
    borderRadius: 6,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 },
  },
  text: { fontFamily: pixelFont, fontSize: 14, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase" },
  disabled: { opacity: 0.6 },
});
