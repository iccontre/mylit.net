import { Platform, Pressable, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { Modal, KeyboardAvoidingView, ScrollView } from "react-native";

import { accentByParchmentAccent, parchmentBody, parchmentBorder, parchmentGeometry, parchmentInk, type ParchmentAccent } from "../../constants/parchmentTokens";
import { SaveButton, type SaveState } from "./SaveButton";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

type EditorModalProps = {
  visible: boolean;
  accent?: ParchmentAccent;
  title: string;
  onClose: () => void;
  /** Shown briefly after a successful save (e.g. "Saved ✓") — caller controls timing. */
  successMessage?: string;
  saveLabel?: string;
  cancelLabel?: string;
  onSave?: () => void;
  saveDisabled?: boolean;
  saving?: boolean;
  /** Full idle/saving/saved/error state — overrides `saving` for rendering when provided. */
  saveState?: SaveState;
  /** Hide the footer entirely when the screen provides its own action row. */
  hideFooter?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/**
 * Shared visual shell for editor popups (journal/affirmation/check-in sub-entry/food log/
 * routine/checklist). Consolidates presentation only — callers keep their own save handlers,
 * validation, and storage calls; this component never persists anything itself. Dims the
 * origin screen, never navigates, and returns control to the caller via onClose/onSave exactly
 * as the existing modals already do.
 */
export function EditorModal({
  visible,
  accent = "neutral",
  title,
  onClose,
  successMessage,
  saveLabel = "SAVE",
  cancelLabel = "CANCEL",
  onSave,
  saveDisabled,
  saving,
  saveState,
  hideFooter,
  contentStyle,
  children,
}: EditorModalProps) {
  const accentColor = accentByParchmentAccent[accent];
  const resolvedSaveState: SaveState = saveState ?? (saving ? "saving" : "idle");

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={saving ? undefined : onClose}>
      {/* Only a tap on the backdrop itself closes the modal — the no-op Pressable wrapping the
       *  panel below claims the responder for everything inside it, so taps on the panel (even
       *  on non-interactive dead space) never bubble up and accidentally dismiss. Disabled while
       *  saving so a confirmed write in flight can't be interrupted. */}
      <Pressable style={styles.backdrop} onPress={saving ? undefined : onClose} accessibilityLabel="Close">
        <KeyboardAvoidingView
          style={styles.keyboardAvoider}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 20 : 0}
        >
          <Pressable style={styles.panel} onPress={() => {}}>
            <View style={[styles.titleStrip, { backgroundColor: accentColor }]}>
              <Text style={styles.titleStripText} numberOfLines={2}>{title}</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {successMessage ? (
              <View style={styles.successBanner}>
                <Text style={styles.successBannerText}>{successMessage}</Text>
              </View>
            ) : null}

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.scrollContent, contentStyle]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>

            {!hideFooter ? (
              <View style={styles.footer}>
                <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving} accessibilityLabel={cancelLabel}>
                  <Text style={styles.cancelBtnText}>{cancelLabel}</Text>
                </TouchableOpacity>
                {onSave ? (
                  <SaveButton
                    state={resolvedSaveState}
                    disabled={saveDisabled}
                    onPress={onSave}
                    idleLabel={saveLabel}
                    style={styles.saveBtn}
                  />
                ) : null}
              </View>
            ) : null}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(2,4,10,0.82)", alignItems: "center", justifyContent: "center", padding: 16 },
  keyboardAvoider: { width: "100%", maxWidth: 400, maxHeight: "88%" },
  panel: {
    width: "100%",
    backgroundColor: parchmentBody,
    borderWidth: parchmentGeometry.surfaceBorderWidth,
    borderColor: parchmentBorder,
    borderRadius: parchmentGeometry.surfaceRadius,
    overflow: "hidden",
    ...parchmentGeometry.hardShadow,
  },
  titleStrip: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: 14 },
  titleStripText: { flex: 1, color: "#FFFFFF", fontFamily: pixelFont, fontSize: 15, fontWeight: "900", letterSpacing: 0.3 },
  closeBtn: { width: 28, height: 28, borderRadius: 5, borderWidth: 2, borderColor: "rgba(255,255,255,0.6)", alignItems: "center", justifyContent: "center", marginLeft: 8 },
  closeBtnText: { color: "#FFFFFF", fontFamily: pixelFont, fontSize: 13, fontWeight: "900" },
  successBanner: { backgroundColor: "#DCFCE7", borderBottomWidth: 2, borderBottomColor: "#16A34A", paddingVertical: 8, paddingHorizontal: 14 },
  successBannerText: { color: "#14532D", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", textAlign: "center" },
  scroll: { flexGrow: 0 },
  scrollContent: { padding: 14 },
  footer: { flexDirection: "row", gap: 10, padding: 14, paddingTop: 4 },
  cancelBtn: { flex: 1, borderWidth: 2, borderColor: parchmentBorder, borderRadius: parchmentGeometry.actionRadius, paddingVertical: 12, alignItems: "center", backgroundColor: "#E7D3A9" },
  cancelBtnText: { color: parchmentInk, fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  saveBtn: { flex: 2, paddingVertical: 12 },
});
