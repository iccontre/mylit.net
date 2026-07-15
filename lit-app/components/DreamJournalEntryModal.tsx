import { useEffect, useState } from "react";
import { Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { formStyles } from "../constants/formStyles";
import { saveDreamEntry } from "../lib/dreamJournal";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

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
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle("");
    setSummary("");
    setFeeling("");
    setSaving(false);
    setJustSaved(false);
  }, [visible]);

  async function handleSave() {
    if (saving || justSaved) return;
    setSaving(true);
    try {
      const entry = await saveDreamEntry({ title, summary, feeling });
      if (!entry) {
        setSaving(false);
        return;
      }
      setJustSaved(true);
      onSaved?.();
      setTimeout(onClose, 600);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>🌙 Dream Journal</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
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
                    style={[styles.chip, selected && styles.chipActive]}
                    onPress={() => setFeeling(selected ? "" : `${opt.emoji} ${opt.label}`)}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>{opt.emoji} {opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, (saving || justSaved) && styles.saveBtnDisabled]} disabled={saving || justSaved} onPress={handleSave}>
              <Text style={styles.saveBtnText}>{justSaved ? "SAVED ✓" : saving ? "SAVING…" : "SAVE DREAM · +1 STEP"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
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
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  title: { color: "#3D2C18", fontFamily: pixelFont, fontSize: 16, fontWeight: "900" },
  closeBtn: { width: 30, height: 30, borderWidth: 2, borderColor: "#5C4425", borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: "#E7D3A9" },
  closeBtnText: { color: "#4A3620", fontFamily: pixelFont, fontSize: 14, fontWeight: "900" },
  scroll: { maxHeight: 420 },
  label: { color: "#4A3620", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", marginTop: 10, marginBottom: 4, letterSpacing: 0.4, textTransform: "uppercase" },
  input: { marginBottom: 4 },
  textArea: { minHeight: 90, maxHeight: 140 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  chip: { borderWidth: 2, borderColor: "#8B6B3D", borderRadius: 6, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: "#E7D3A9" },
  chipActive: { backgroundColor: "#7C3AED", borderColor: "#4C1D95" },
  chipText: { color: "#4A3620", fontFamily: pixelFont, fontSize: 11, fontWeight: "800" },
  chipTextActive: { color: "#FFFFFF" },
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  cancelBtn: { flex: 1, borderWidth: 2, borderColor: "#5C4425", borderRadius: 6, paddingVertical: 11, alignItems: "center", backgroundColor: "#E7D3A9" },
  cancelBtnText: { color: "#4A3620", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
  saveBtn: { flex: 2, borderWidth: 3, borderColor: "#4C1D95", borderRadius: 6, paddingVertical: 11, alignItems: "center", backgroundColor: "#7C3AED" },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: "#FFFFFF", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 0.3 },
});
