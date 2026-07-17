import { useEffect, useState } from "react";
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { formStyles } from "../constants/formStyles";
import { uiAssets } from "../constants/uiAssets";
import { hubPalettes } from "../constants/worldTokens";
import { saveDreamEntry } from "../lib/dreamJournal";
import { SaveButton, type SaveState } from "./parchment/SaveButton";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });
const palette = hubPalettes.sleep;

const FEELING_OPTIONS = [
  { emoji: "😊", label: "Happy" },
  { emoji: "😌", label: "Peaceful" },
  { emoji: "😃", label: "Excited" },
  { emoji: "😕", label: "Confused" },
  { emoji: "😨", label: "Scared" },
  { emoji: "😢", label: "Sad" },
  { emoji: "🌀", label: "Surreal" },
  { emoji: "🤔", label: "Unsettled" },
];

type DreamJournalEntryModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Called after a dream is genuinely saved (not on cancel/empty). */
  onSaved?: () => void;
};

/**
 * Dream Journal as an in-flow modal, not a separate route — the ONLY way to log a dream from
 * inside Morning Check-In without navigating away and losing the check-in's own draft. Saves
 * through the exact same lib/dreamJournal.ts path the full Dream Journal page uses, so the
 * entry shows up in the same history and earns its step exactly once either way. Canceling or
 * closing (backdrop, back gesture) returns to the caller with nothing lost — the check-in form
 * underneath was never unmounted.
 */
export function DreamJournalEntryModal({ visible, onClose, onSaved }: DreamJournalEntryModalProps) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [feeling, setFeeling] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saving = saveState === "saving";

  useEffect(() => {
    if (!visible) return;
    setTitle("");
    setSummary("");
    setFeeling("");
    setSaveState("idle");
  }, [visible]);

  async function handleSave() {
    if (saveState === "saving" || saveState === "saved") return;
    setSaveState("saving");
    try {
      const entry = await saveDreamEntry({ title, summary, feeling });
      if (!entry) {
        setSaveState("idle");
        return;
      }
      setSaveState("saved");
      onSaved?.();
      setTimeout(onClose, 600);
    } catch {
      setSaveState("error");
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={saving ? undefined : onClose}>
      <Pressable style={styles.backdrop} onPress={saving ? undefined : onClose} accessibilityLabel="Close">
        <Pressable style={styles.panel} onPress={() => {}}>
          <View style={[styles.titleStrip, { backgroundColor: palette.chrome }]}>
            <Text style={styles.title}>🌙 Dream Journal</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={saving} accessibilityLabel="Close">
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.stepIndicator}>YOUR MORNING CHECK-IN IS SAVED — THIS WON&apos;T LOSE YOUR ANSWERS</Text>
          <View style={styles.lunaRow}>
            <Image source={uiAssets.guides.luna} style={styles.lunaAvatar} resizeMode="contain" />
            <Text style={styles.lunaText}>Most dreams fade within about 10 minutes — write it down now, even just fragments.</Text>
          </View>
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Dream title</Text>
            <TextInput style={[formStyles.input, styles.input]} placeholder="Example: The train under the ocean" placeholderTextColor="#8A5D2B" value={title} onChangeText={setTitle} />

            <Text style={styles.label}>Write your dream</Text>
            <TextInput
              style={[formStyles.textArea, styles.textArea]}
              multiline
              scrollEnabled
              textAlignVertical="top"
              placeholder="Write what you remember…"
              placeholderTextColor="#8A5D2B"
              value={summary}
              onChangeText={setSummary}
            />

            <Text style={styles.label}>How did it feel?</Text>
            <View style={styles.chipRow}>
              {FEELING_OPTIONS.map((opt) => {
                const selected = feeling === `${opt.emoji} ${opt.label}`;
                return (
                  <TouchableOpacity
                    key={opt.label}
                    style={[styles.chip, selected && { backgroundColor: palette.edge, borderColor: palette.chrome }]}
                    onPress={() => setFeeling(selected ? "" : `${opt.emoji} ${opt.label}`)}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>{opt.emoji} {opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving} accessibilityLabel="Cancel">
              <Text style={styles.cancelBtnText}>CANCEL</Text>
            </TouchableOpacity>
            <SaveButton state={saveState} onPress={handleSave} idleLabel="SAVE DREAM · +1 STEP" style={styles.saveBtn} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(2,4,10,0.82)", alignItems: "center", justifyContent: "center", padding: 18 },
  panel: {
    width: "100%",
    maxWidth: 380,
    maxHeight: "86%",
    backgroundColor: "#EAD9B6",
    borderWidth: 3,
    borderColor: "#5C4425",
    borderRadius: 8,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  titleStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#7C3AED",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  title: { color: "#FFFFFF", fontFamily: pixelFont, fontSize: 16, fontWeight: "900" },
  closeBtn: { width: 28, height: 28, borderWidth: 2, borderColor: "rgba(255,255,255,0.6)", borderRadius: 6, alignItems: "center", justifyContent: "center" },
  closeBtnText: { color: "#FFFFFF", fontFamily: pixelFont, fontSize: 13, fontWeight: "900" },
  stepIndicator: {
    color: "#7C5B2B",
    fontFamily: pixelFont,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.3,
    textAlign: "center",
    paddingTop: 10,
    paddingHorizontal: 14,
  },
  lunaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 14,
    marginTop: 8,
    padding: 8,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#8B6B3D",
    backgroundColor: "rgba(58, 42, 21, 0.92)",
  },
  lunaAvatar: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: "#A78BFA" },
  lunaText: { flex: 1, color: "#F9FAFB", fontFamily: pixelFont, fontSize: 11, lineHeight: 15, fontWeight: "700" },
  scroll: { maxHeight: 380, paddingHorizontal: 14 },
  label: { color: "#4A3620", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", marginTop: 10, marginBottom: 4, letterSpacing: 0.4, textTransform: "uppercase" },
  input: { marginBottom: 4 },
  textArea: { minHeight: 90, maxHeight: 140 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  chip: { borderWidth: 2, borderColor: "#8B6B3D", borderRadius: 6, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: "#E7D3A9" },
  chipText: { color: "#4A3620", fontFamily: pixelFont, fontSize: 11, fontWeight: "800" },
  chipTextActive: { color: "#FFFFFF" },
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 12, paddingHorizontal: 14, paddingBottom: 14 },
  cancelBtn: { flex: 1, borderWidth: 2, borderColor: "#5C4425", borderRadius: 6, paddingVertical: 11, alignItems: "center", backgroundColor: "#E7D3A9" },
  cancelBtnText: { color: "#4A3620", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
  saveBtn: { flex: 2, paddingVertical: 11 },
});
