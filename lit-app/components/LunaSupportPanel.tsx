import { useCallback, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import {
  applyMoveTime,
  applyReduceDuration,
  applySwapToRecovery,
  loadLatestLunaSupportSession,
  requestLunaSupport,
  saveLunaRecoveryQuestSuggestion,
} from "../lib/lunaSupportModifier";
import { LATEST_CHECKIN_KEY } from "../lib/storageKeys";
import { friendlyAiUnavailableMessage } from "../lib/aiUnavailableMessages";
import type { LunaPlanAdjustment, LunaRecoveryQuestSuggestion, LunaSupportModifierResponse } from "../lib/agentTypes";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

const ADJUSTMENT_LABELS: Record<LunaPlanAdjustment["type"], string> = {
  reduce_duration: "Shorten this quest",
  move_later: "Move it later",
  move_earlier: "Move it earlier",
  swap_progress_for_recovery: "Make it a Recovery quest",
  add_recovery: "Add a recovery quest",
  pause_goal: "Pause this goal",
  ask_evie_to_rebuild: "Ask Evie to rebuild the plan",
};

/**
 * Luna's AI Support Modifier: the user tells Luna what got hard, and she notices patterns
 * (missed quests, low energy, poor sleep, heavy reflections) and proposes gentle plan
 * adjustments. Every adjustment is Accept-only — nothing here changes a quest automatically.
 */
export function LunaSupportPanel() {
  const router = useRouter();
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<LunaSupportModifierResponse | null>(null);
  const [boardMode, setBoardMode] = useState<"Progress" | "Recovery">("Progress");
  const [adjustmentStatus, setAdjustmentStatus] = useState<Record<number, string>>({});
  const [recoveryStatus, setRecoveryStatus] = useState<Record<number, string>>({});
  // Synchronous in-flight lock — belt-and-suspenders alongside the `loading` state/disabled
  // prop, so a rapid double-click/double-tap can never fire two overlapping AI calls.
  const inFlightRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const [latest, checkInRaw] = await Promise.all([loadLatestLunaSupportSession(), AsyncStorage.getItem(LATEST_CHECKIN_KEY)]);
        if (latest) setResult(latest.response);
        try {
          const checkIn = checkInRaw ? JSON.parse(checkInRaw) : null;
          setBoardMode(checkIn?.mode === "Recovery" ? "Recovery" : "Progress");
        } catch {
          setBoardMode("Progress");
        }
      })();
    }, [])
  );

  async function handleAskLuna() {
    if (inFlightRef.current || !messageText.trim()) return;
    inFlightRef.current = true;
    setLoading(true);
    setError("");
    try {
      const outcome = await requestLunaSupport(messageText);
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      setResult(outcome.record.response);
      setAdjustmentStatus({});
      setRecoveryStatus({});
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }

  async function handleAdjustment(adjustment: LunaPlanAdjustment, index: number) {
    if (adjustment.type === "ask_evie_to_rebuild") {
      router.push("/path");
      return;
    }
    if (!adjustment.targetQuestId) return;

    let outcome: { ok: boolean; reason?: string };
    if (adjustment.type === "reduce_duration") {
      outcome = await applyReduceDuration(adjustment.targetQuestId, adjustment.suggestedDurationMinutes);
    } else if (adjustment.type === "swap_progress_for_recovery") {
      outcome = await applySwapToRecovery(adjustment.targetQuestId);
    } else if (adjustment.type === "move_later") {
      outcome = await applyMoveTime(adjustment.targetQuestId, 1);
    } else if (adjustment.type === "move_earlier") {
      outcome = await applyMoveTime(adjustment.targetQuestId, -1);
    } else {
      return;
    }

    setAdjustmentStatus((prev) => ({ ...prev, [index]: outcome.ok ? "Done." : outcome.reason ?? "Could not apply that change." }));
  }

  async function handleSaveRecovery(quest: LunaRecoveryQuestSuggestion, index: number) {
    const outcome = await saveLunaRecoveryQuestSuggestion(quest, boardMode);
    setRecoveryStatus((prev) => ({ ...prev, [index]: outcome.ok ? "Saved to today's Quest Board." : outcome.reason ?? "Could not save." }));
  }

  const actionableAdjustment = (type: LunaPlanAdjustment["type"]) =>
    type === "reduce_duration" || type === "swap_progress_for_recovery" || type === "move_later" || type === "move_earlier" || type === "ask_evie_to_rebuild";

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>✦ LUNA'S SUPPORT</Text>
      <Text style={styles.helperText}>Tell Luna what got hard — she'll notice patterns and suggest small, gentle adjustments.</Text>

      <TextInput
        style={styles.promptInput}
        multiline
        placeholder="What got hard today?"
        placeholderTextColor="#64748B"
        value={messageText}
        onChangeText={setMessageText}
      />

      <TouchableOpacity style={styles.askButton} onPress={() => void handleAskLuna()} disabled={loading || !messageText.trim()}>
        {loading ? (
          <View style={styles.askButtonRow}>
            <ActivityIndicator color="#F5F3FF" />
            <Text style={[styles.askButtonText, { marginLeft: 8 }]}>Luna is listening...</Text>
          </View>
        ) : (
          <Text style={styles.askButtonText}>ASK LUNA TO HELP ME ADJUST</Text>
        )}
      </TouchableOpacity>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {result ? (
        <View style={styles.resultStack}>
          {result.aiUnavailableReason ? (
            <Text style={styles.noticeText}>{friendlyAiUnavailableMessage(result.aiUnavailableReason, "Luna")}</Text>
          ) : null}

          <View style={[styles.row, { borderColor: "#A78BFA" }]}>
            <Text style={[styles.rowLabel, { color: "#E9D5FF" }]}>LUNA</Text>
            <Text style={styles.rowText}>{result.supportMessage}</Text>
          </View>

          {result.whatLunaNoticed.length ? (
            <View style={[styles.row, { borderColor: "#8B5CF6" }]}>
              <Text style={[styles.rowLabel, { color: "#C4B5FD" }]}>WHAT LUNA NOTICED</Text>
              {result.whatLunaNoticed.map((note, index) => (
                <Text key={index} style={styles.rowSubText}>· {note}</Text>
              ))}
            </View>
          ) : null}

          {result.suggestedPlanAdjustments.map((adjustment, index) => (
            <View key={index} style={[styles.row, { borderColor: "#C084FC" }]}>
              <Text style={[styles.rowLabel, { color: "#E9D5FF" }]}>{ADJUSTMENT_LABELS[adjustment.type].toUpperCase()}</Text>
              <Text style={styles.rowSubText}>· {adjustment.reason}</Text>
              {actionableAdjustment(adjustment.type) ? (
                <TouchableOpacity style={styles.saveButton} onPress={() => void handleAdjustment(adjustment, index)}>
                  <Text style={styles.saveButtonText}>{adjustmentStatus[index] ? "DONE" : ADJUSTMENT_LABELS[adjustment.type].toUpperCase()}</Text>
                </TouchableOpacity>
              ) : null}
              {adjustmentStatus[index] ? <Text style={styles.statusText}>{adjustmentStatus[index]}</Text> : null}
            </View>
          ))}

          {result.recoveryQuestSuggestions.map((quest, index) => (
            <View key={`recovery-${index}`} style={[styles.row, { borderColor: "#F472B6" }]}>
              <Text style={[styles.rowLabel, { color: "#FBCFE8" }]}>SUGGESTED RECOVERY QUEST</Text>
              <Text style={styles.rowText}>{quest.title}</Text>
              <Text style={styles.rowSubText}>· {quest.durationMinutes} min · +{quest.energyRestoreEstimate} energy</Text>
              {quest.reason ? <Text style={styles.rowSubText}>· {quest.reason}</Text> : null}
              <TouchableOpacity style={styles.saveButtonSmall} onPress={() => void handleSaveRecovery(quest, index)}>
                <Text style={styles.saveButtonText}>{recoveryStatus[index] === "Saved to today's Quest Board." ? "SAVED" : "SAVE TO TODAY'S QUESTS"}</Text>
              </TouchableOpacity>
              {recoveryStatus[index] ? <Text style={styles.statusText}>{recoveryStatus[index]}</Text> : null}
            </View>
          ))}

          {result.evieHandoffNote ? (
            <View style={[styles.row, { borderColor: "#94A3B8" }]}>
              <Text style={[styles.rowLabel, { color: "#E2E8F0" }]}>EVIE HANDOFF</Text>
              <Text style={styles.rowText}>{result.evieHandoffNote}</Text>
            </View>
          ) : null}

          {result.safetyNote ? <Text style={styles.disclaimerText}>{result.safetyNote}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: "rgba(7, 11, 27, 0.95)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 3,
    borderColor: "#8B5CF6",
  },
  panelTitle: {
    color: "#E9D5FF",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.5,
    textAlign: "center",
    marginBottom: 8,
  },
  helperText: { color: "#C4B5FD", fontSize: 11, lineHeight: 16, fontWeight: "700", textAlign: "center", marginBottom: 10 },
  promptInput: {
    borderWidth: 2,
    borderColor: "#4C1D95",
    borderRadius: 6,
    padding: 9,
    color: "#F5F3FF",
    fontSize: 12,
    fontWeight: "600",
    minHeight: 64,
    textAlignVertical: "top",
    backgroundColor: "rgba(49,46,129,0.28)",
    marginBottom: 10,
  },
  askButton: {
    borderWidth: 2,
    borderColor: "#A78BFA",
    borderRadius: 6,
    paddingVertical: 11,
    alignItems: "center",
    backgroundColor: "rgba(76,29,149,0.45)",
  },
  askButtonRow: { flexDirection: "row", alignItems: "center" },
  askButtonText: { color: "#E9D5FF", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  errorText: { color: "#FCA5A5", fontSize: 11, lineHeight: 16, fontWeight: "700", textAlign: "center", marginTop: 8 },
  noticeText: { color: "#FCD34D", fontSize: 10, lineHeight: 15, fontWeight: "700", textAlign: "center", marginBottom: 8 },
  resultStack: { marginTop: 10 },
  row: {
    borderWidth: 2,
    borderRadius: 6,
    padding: 9,
    marginBottom: 8,
    backgroundColor: "rgba(46,32,20,0.5)",
  },
  rowLabel: { fontFamily: pixelFont, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginBottom: 4 },
  rowText: { color: "#F5F3FF", fontSize: 12, lineHeight: 17, fontWeight: "700" },
  rowSubText: { color: "#C4B5FD", fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 4 },
  saveButton: {
    marginTop: 8,
    borderWidth: 2,
    borderColor: "#C084FC",
    borderRadius: 6,
    paddingVertical: 9,
    alignItems: "center",
    backgroundColor: "rgba(88,28,135,0.35)",
  },
  saveButtonSmall: {
    marginTop: 6,
    borderWidth: 2,
    borderColor: "#F472B6",
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: "rgba(131,24,67,0.35)",
  },
  saveButtonText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  statusText: { color: "#FDE68A", fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: 5 },
  disclaimerText: { color: "#8B84A8", fontSize: 9, lineHeight: 13, fontWeight: "600", marginTop: 4, textAlign: "center" },
});
