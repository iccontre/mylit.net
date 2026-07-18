import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { getSessionSafe } from "../lib/auth";
import { emitQuestCompletionFeedback } from "../lib/completionFeedback";
import { isDuplicateFoodLog, type FoodEntryType, type FoodLog } from "../lib/fuel";
import { persistProgressKeys } from "../lib/progressStore";
import { readJson } from "../lib/readJson";
import { getQuestDayKey, parseTimeToMinutes } from "../lib/scheduling";
import { FOOD_LOGS_KEY } from "../lib/storageKeys";
import { SaveButton, type SaveState } from "./parchment/SaveButton";
import { hubPalettes } from "../constants/worldTokens";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });
const palette = hubPalettes.progress;

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
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [validationError, setValidationError] = useState("");
  const saving = saveState === "saving";

  useEffect(() => {
    if (!visible) return;
    setEntryType("meal");
    setUseExactTime(false);
    setExactTime("");
    setNote("");
    setSaveState("idle");
    setValidationError("");
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
    if (saveState === "saving" || saveState === "saved") return;
    const eatenAtDate = resolveEatenAt();
    if (!eatenAtDate) {
      setValidationError("Enter a valid time, like 1:30 PM, or leave it blank for now.");
      return;
    }
    setSaveState("saving");
    setValidationError("");

    try {
      const eatenAt = eatenAtDate.toISOString();
      const existing = await readJson<FoodLog[]>(FOOD_LOGS_KEY, []);

      // A double-tap/rapid resubmit of the same real event must never log twice — see
      // isDuplicateFoodLog for why this is separate from the array-merge-by-id dedup.
      if (isDuplicateFoodLog(existing, { eatenAt, entryType })) {
        setSaveState("idle");
        onClose();
        return;
      }

      // A session-lookup failure (network blip, token refresh) must never block this local-first
      // save — see getSessionSafe.
      const session = await getSessionSafe();
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
      setSaveState("saved");
      // Brief visible ✓ SAVED confirmation before this closes, matching the shared Save-state
      // pattern, instead of vanishing the instant persistence resolves.
      setTimeout(onClose, 800);
    } catch {
      setSaveState("error");
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={saving ? undefined : onClose}>
      <Pressable style={styles.backdrop} onPress={saving ? undefined : onClose} accessibilityLabel="Close">
        <Pressable style={styles.panel} onPress={() => {}}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={saving} accessibilityLabel="Close">
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title}>FOOD LOG</Text>
          <Text style={styles.subtitle}>Log a meal or snack — this is just for you, no judgment.</Text>

          <Text style={styles.label}>Meal or snack?</Text>
          <View style={styles.choiceRow}>
            <TouchableOpacity
              style={[styles.choiceButton, entryType === "meal" && { backgroundColor: palette.edge, borderColor: palette.chrome }]}
              onPress={() => setEntryType("meal")}
            >
              <Text style={[styles.choiceText, entryType === "meal" && styles.choiceTextActive]}>Meal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.choiceButton, entryType === "snack" && { backgroundColor: palette.edge, borderColor: palette.chrome }]}
              onPress={() => setEntryType("snack")}
            >
              <Text style={[styles.choiceText, entryType === "snack" && styles.choiceTextActive]}>Snack</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>When did you eat?</Text>
          <View style={styles.choiceRow}>
            <TouchableOpacity
              style={[styles.choiceButton, !useExactTime && { backgroundColor: palette.edge, borderColor: palette.chrome }]}
              onPress={() => setUseExactTime(false)}
            >
              <Text style={[styles.choiceText, !useExactTime && styles.choiceTextActive]}>Now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.choiceButton, useExactTime && { backgroundColor: palette.edge, borderColor: palette.chrome }]}
              onPress={() => setUseExactTime(true)}
            >
              <Text style={[styles.choiceText, useExactTime && styles.choiceTextActive]}>Exact time</Text>
            </TouchableOpacity>
          </View>
          {useExactTime ? (
            <TextInput
              style={styles.input}
              placeholder="Example: 1:30 PM"
              placeholderTextColor="#8A5D2B"
              autoCapitalize="characters"
              value={exactTime}
              onChangeText={setExactTime}
            />
          ) : null}

          <Text style={styles.label}>Note — optional</Text>
          <TextInput
            style={styles.input}
            placeholder="Example: sandwich and fruit"
            placeholderTextColor="#8A5D2B"
            value={note}
            onChangeText={setNote}
          />

          {validationError ? <Text style={styles.errorText}>{validationError}</Text> : null}

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving} accessibilityLabel="Cancel">
              <Text style={styles.cancelBtnText}>CANCEL</Text>
            </TouchableOpacity>
            <SaveButton state={saveState} onPress={() => void handleSave()} style={styles.saveBtn} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(28,18,10,0.82)", padding: 18, justifyContent: "center" },
  panel: {
    backgroundColor: "#EAD9B6",
    borderWidth: 3,
    borderColor: "#5C4425",
    borderRadius: 10,
    padding: 16,
  },
  closeBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 44,
    height: 44,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#B3261E",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  closeBtnText: { color: "#B3261E", fontFamily: pixelFont, fontSize: 16, fontWeight: "900" },
  title: { color: "#4A3620", fontFamily: pixelFont, fontSize: 16, fontWeight: "900", textAlign: "center", letterSpacing: 1 },
  subtitle: { color: "#7C5B2B", fontSize: 11, lineHeight: 16, fontWeight: "700", textAlign: "center", marginTop: 6, marginBottom: 12 },
  label: {
    color: "#4A3620",
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
    backgroundColor: "#F4E8CE",
    borderWidth: 2,
    borderColor: "#5C4425",
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
  },
  choiceText: { color: "#4A3620", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  choiceTextActive: { color: "#FFFFFF" },
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
  errorText: { color: "#B3261E", fontSize: 11, fontWeight: "700", marginTop: 10 },
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#3E2A1A",
    borderWidth: 2,
    borderColor: "#5C4425",
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelBtnText: { color: "#D8C9A3", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  saveBtn: { flex: 1, paddingVertical: 11 },
});
