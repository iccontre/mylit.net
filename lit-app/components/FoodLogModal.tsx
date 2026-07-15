import { useEffect, useState } from "react";
import { Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { getSession } from "../lib/auth";
import { emitQuestCompletionFeedback } from "../lib/completionFeedback";
import { isDuplicateFoodLog, type FoodEntryType, type FoodLog } from "../lib/fuel";
import { persistProgressKeys } from "../lib/progressStore";
import { readJson } from "../lib/readJson";
import { getQuestDayKey, parseTimeToMinutes } from "../lib/scheduling";
import { FOOD_LOGS_KEY } from "../lib/storageKeys";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

type FoodLogModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Called after a new log is genuinely saved (not on a no-op/duplicate) so the caller can
   *  reload fuel, clear an active food gate, etc. */
  onSaved: (log: FoodLog) => void;
};

/** Small MYLIT-styled form for logging a meal/snack — see lib/fuel.ts for how this feeds the fuel estimate. */
export function FoodLogModal({ visible, onClose, onSaved }: FoodLogModalProps) {
  const [entryType, setEntryType] = useState<FoodEntryType>("meal");
  const [useExactTime, setUseExactTime] = useState(false);
  const [exactTime, setExactTime] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    setEntryType("meal");
    setUseExactTime(false);
    setExactTime("");
    setNote("");
    setSaving(false);
    setError("");
  }, [visible]);

  function resolveEatenAt(): Date | null {
    if (!useExactTime || !exactTime.trim()) return new Date();
    const minutes = parseTimeToMinutes(exactTime.trim());
    if (minutes === null) return null;
    const d = new Date();
    d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return d;
  }

  async function handleSave() {
    if (saving) return;
    const eatenAtDate = resolveEatenAt();
    if (!eatenAtDate) {
      setError("Enter a valid time, like 1:30 PM, or leave it blank for now.");
      return;
    }
    setSaving(true);
    setError("");

    try {
      const eatenAt = eatenAtDate.toISOString();
      const existing = await readJson<FoodLog[]>(FOOD_LOGS_KEY, []);

      // A double-tap/rapid resubmit of the same real event must never log twice — see
      // isDuplicateFoodLog for why this is separate from the array-merge-by-id dedup.
      if (isDuplicateFoodLog(existing, { eatenAt, entryType })) {
        onClose();
        return;
      }

      const session = await getSession();
      const now = new Date().toISOString();
      const log: FoodLog = {
        id: `foodlog-${Date.now()}`,
        userId: session?.user?.id ?? "local",
        eatenAt,
        entryType,
        note: note.trim() || undefined,
        logicalDayKey: getQuestDayKey(eatenAtDate),
        createdAt: now,
        updatedAt: now,
      };

      const next = [log, ...existing];
      await persistProgressKeys({ [FOOD_LOGS_KEY]: JSON.stringify(next) });

      // Flame reaction only (no step toast) — steps for actually clearing a food gate are
      // awarded separately, once, through the normal quest-completion reward path.
      emitQuestCompletionFeedback({
        completionId: `food-log-reaction-${log.id}`,
        questId: "food-log",
        stepsAwarded: 0,
        guide: "luna",
        energyEffect: "restore",
      });

      onSaved(log);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          <Text style={styles.title}>FOOD LOG</Text>
          <Text style={styles.subtitle}>Log a meal or snack — this is just for you, no judgment.</Text>

          <Text style={styles.label}>Meal or snack?</Text>
          <View style={styles.choiceRow}>
            <TouchableOpacity
              style={[styles.choiceButton, entryType === "meal" && styles.choiceButtonActive]}
              onPress={() => setEntryType("meal")}
            >
              <Text style={[styles.choiceText, entryType === "meal" && styles.choiceTextActive]}>Meal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.choiceButton, entryType === "snack" && styles.choiceButtonActive]}
              onPress={() => setEntryType("snack")}
            >
              <Text style={[styles.choiceText, entryType === "snack" && styles.choiceTextActive]}>Snack</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>When did you eat?</Text>
          <View style={styles.choiceRow}>
            <TouchableOpacity
              style={[styles.choiceButton, !useExactTime && styles.choiceButtonActive]}
              onPress={() => setUseExactTime(false)}
            >
              <Text style={[styles.choiceText, !useExactTime && styles.choiceTextActive]}>Now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.choiceButton, useExactTime && styles.choiceButtonActive]}
              onPress={() => setUseExactTime(true)}
            >
              <Text style={[styles.choiceText, useExactTime && styles.choiceTextActive]}>Exact time</Text>
            </TouchableOpacity>
          </View>
          {useExactTime ? (
            <TextInput
              style={styles.input}
              placeholder="Example: 1:30 PM"
              placeholderTextColor="#64748B"
              autoCapitalize="characters"
              value={exactTime}
              onChangeText={setExactTime}
            />
          ) : null}

          <Text style={styles.label}>Note — optional</Text>
          <TextInput
            style={styles.input}
            placeholder="Example: sandwich and fruit"
            placeholderTextColor="#64748B"
            value={note}
            onChangeText={setNote}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} disabled={saving} onPress={() => void handleSave()}>
              <Text style={styles.saveBtnText}>{saving ? "SAVING…" : "SAVE"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(2,4,10,0.88)", padding: 18, justifyContent: "center" },
  panel: {
    backgroundColor: "rgba(8,13,24,0.98)",
    borderWidth: 3,
    borderColor: "#334155",
    borderRadius: 10,
    padding: 16,
  },
  title: { color: "#FDE047", fontFamily: pixelFont, fontSize: 16, fontWeight: "900", textAlign: "center", letterSpacing: 1 },
  subtitle: { color: "#CBD5E1", fontSize: 11, lineHeight: 16, fontWeight: "700", textAlign: "center", marginTop: 6, marginBottom: 12 },
  label: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
    marginTop: 10,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  choiceRow: { flexDirection: "row", gap: 8 },
  choiceButton: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
  },
  choiceButtonActive: { backgroundColor: "rgba(49, 46, 129, 0.96)", borderColor: "#A78BFA" },
  choiceText: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  choiceTextActive: { color: "#F9FAFB" },
  input: {
    backgroundColor: "#F4E8CE",
    borderWidth: 2,
    borderColor: "#5C4425",
    borderRadius: 7,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: "#4A3620",
    fontFamily: pixelFont,
    fontSize: 13,
    marginTop: 8,
  },
  errorText: { color: "#FCA5A5", fontSize: 11, fontWeight: "700", marginTop: 10 },
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  cancelBtn: {
    flex: 1,
    backgroundColor: "rgba(8, 13, 24, 0.94)",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelBtnText: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  saveBtn: {
    flex: 1,
    backgroundColor: "#A78BFA",
    borderWidth: 3,
    borderColor: "#E9D5FF",
    borderRadius: 6,
    paddingVertical: 11,
    alignItems: "center",
  },
  saveBtnDisabled: { backgroundColor: "#334155", borderColor: "#475569" },
  saveBtnText: { color: "#0F172A", fontFamily: pixelFont, fontSize: 13, fontWeight: "900", letterSpacing: 1 },
});
