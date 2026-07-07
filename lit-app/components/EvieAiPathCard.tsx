import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { loadUserLifeProfile } from "../lib/mylitAgents";
import {
  loadLatestEvieAiPathPipeline,
  requestEviePathPipeline,
  saveAiDailyQuestSuggestion,
  saveAiWeeklyHabitSuggestion,
} from "../lib/evieAiPathPipeline";
import { LATEST_CHECKIN_KEY } from "../lib/storageKeys";
import { friendlyAiUnavailableMessage } from "../lib/aiUnavailableMessages";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { EvieAiDailyQuestSuggestion, EvieAiPathPipelineResponse, EvieAiWeeklyHabitSuggestion } from "../lib/agentTypes";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

/**
 * Evie's AI Path: MYLIT's first LLM-backed planner. The user writes (or edits) their own
 * goal prompt, Evie turns it into a structured plan, and every suggestion here is Save-only
 * — nothing is auto-created. Saving still goes through the same validated helpers the
 * deterministic PathPipelineCard uses (see lib/evieAiPathPipeline.ts).
 */
export function EvieAiPathCard() {
  const [promptText, setPromptText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<EvieAiPathPipelineResponse | null>(null);
  const [boardMode, setBoardMode] = useState<"Progress" | "Recovery">("Progress");
  const [habitStatus, setHabitStatus] = useState<Record<number, string>>({});
  const [questStatus, setQuestStatus] = useState<Record<number, string>>({});
  const [usedCache, setUsedCache] = useState(false);
  // Synchronous in-flight lock — belt-and-suspenders alongside the `loading` state/disabled
  // prop, so a rapid double-click/double-tap can never fire two overlapping AI calls even if
  // React hasn't re-rendered the disabled button yet.
  const inFlightRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const [profile, latest, checkInRaw] = await Promise.all([
          loadUserLifeProfile(),
          loadLatestEvieAiPathPipeline(),
          AsyncStorage.getItem(LATEST_CHECKIN_KEY),
        ]);
        setPromptText((prev) => prev || profile.longTermDreamStatement?.trim() || profile.futureSelfStatement?.trim() || "");
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

  async function handleAskEvie(options?: { forceRefresh?: boolean }) {
    if (inFlightRef.current || !promptText.trim()) return;
    inFlightRef.current = true;
    setLoading(true);
    setError("");
    try {
      const outcome = await requestEviePathPipeline(promptText, options);
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      setResult(outcome.record.response);
      setUsedCache(outcome.fromCache);
      setHabitStatus({});
      setQuestStatus({});
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }

  async function handleSaveHabit(habit: EvieAiWeeklyHabitSuggestion, index: number) {
    const habitResult = await saveAiWeeklyHabitSuggestion(habit);
    setHabitStatus((prev) => ({
      ...prev,
      [index]: habitResult.savedDays.length
        ? `Saved to ${habitResult.savedDays.join(", ")}.`
        : "Those days already have a habit set — edit them in Day Plan.",
    }));
  }

  async function handleSaveQuest(quest: EvieAiDailyQuestSuggestion, index: number) {
    const questResult = await saveAiDailyQuestSuggestion(quest, boardMode);
    setQuestStatus((prev) => ({ ...prev, [index]: questResult.ok ? "Saved to today's Quest Board." : questResult.reason ?? "Could not save." }));
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>✦ EVIE'S AI PATH</Text>
      <Text style={styles.helperText}>
        Write exactly what you're building toward — the more specific, the more tailored Evie's plan can be.
      </Text>
      <TextInput
        style={styles.promptInput}
        multiline
        placeholder="e.g. Get a UX design internship by next summer"
        placeholderTextColor="#64748B"
        value={promptText}
        onChangeText={setPromptText}
      />

      <TouchableOpacity style={styles.askButton} onPress={() => void handleAskEvie()} disabled={loading || !promptText.trim()}>
        {loading ? (
          <View style={styles.askButtonRow}>
            <ActivityIndicator color="#F8FAFC" />
            <Text style={[styles.askButtonText, { marginLeft: 8 }]}>Evie is studying your path...</Text>
          </View>
        ) : (
          <Text style={styles.askButtonText}>ASK EVIE TO BUILD MY PATH</Text>
        )}
      </TouchableOpacity>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {result ? (
        <View style={styles.resultStack}>
          {result.aiUnavailableReason ? (
            <Text style={styles.noticeText}>{friendlyAiUnavailableMessage(result.aiUnavailableReason, "Evie")}</Text>
          ) : usedCache ? (
            <View style={styles.cacheNoticeRow}>
              <Text style={styles.cacheNoticeText}>Using cached result — nothing changed since your last ask.</Text>
              <TouchableOpacity disabled={loading} onPress={() => void handleAskEvie({ forceRefresh: true })}>
                <Text style={styles.cacheRefreshLink}>Regenerate</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={[styles.row, { borderColor: "#FBBF24" }]}>
            <Text style={[styles.rowLabel, { color: "#FDE68A" }]}>GOAL SUMMARY</Text>
            <Text style={styles.rowText}>{result.goalSummary}</Text>
          </View>

          {result.clarifyingQuestions.length ? (
            <View style={[styles.row, { borderColor: "#F97316" }]}>
              <Text style={[styles.rowLabel, { color: "#FDBA74" }]}>EVIE NEEDS A BIT MORE</Text>
              {result.clarifyingQuestions.map((question, index) => (
                <Text key={index} style={styles.rowSubText}>· {question}</Text>
              ))}
            </View>
          ) : null}

          {result.threeMonthDirection.title ? (
            <View style={[styles.row, { borderColor: "#FBBF24" }]}>
              <Text style={[styles.rowLabel, { color: "#FDE68A" }]}>3-MONTH DIRECTION</Text>
              <Text style={styles.rowText}>{result.threeMonthDirection.title}</Text>
              {result.threeMonthDirection.description ? <Text style={styles.rowSubText}>{result.threeMonthDirection.description}</Text> : null}
            </View>
          ) : null}

          {result.oneMonthMilestone.title ? (
            <View style={[styles.row, { borderColor: "#38BDF8" }]}>
              <Text style={[styles.rowLabel, { color: "#BAE6FD" }]}>1-MONTH MILESTONE</Text>
              <Text style={styles.rowText}>{result.oneMonthMilestone.title}</Text>
              {result.oneMonthMilestone.description ? <Text style={styles.rowSubText}>{result.oneMonthMilestone.description}</Text> : null}
            </View>
          ) : null}

          {result.twoWeekSprint.title ? (
            <View style={[styles.row, { borderColor: "#22C55E" }]}>
              <Text style={[styles.rowLabel, { color: "#86EFAC" }]}>2-WEEK SPRINT</Text>
              <Text style={styles.rowText}>{result.twoWeekSprint.title}</Text>
              {result.twoWeekSprint.steps.map((step, index) => (
                <Text key={index} style={styles.rowSubText}>· {step}</Text>
              ))}
            </View>
          ) : null}

          {result.weeklyHabitSuggestions.map((habit, index) => (
            <View key={`habit-${index}`} style={[styles.row, { borderColor: "#A78BFA" }]}>
              <Text style={[styles.rowLabel, { color: "#E9D5FF" }]}>SUGGESTED WEEKLY HABIT</Text>
              <Text style={styles.rowText}>{habit.title}</Text>
              <Text style={styles.rowSubText}>
                · {habit.repeatDays.join(", ")} · {habit.durationMinutes} min · {habit.mode === "recovery" ? "Recovery" : "Progress"}
              </Text>
              {habit.reason ? <Text style={styles.rowSubText}>· {habit.reason}</Text> : null}
              <TouchableOpacity style={styles.saveButton} onPress={() => void handleSaveHabit(habit, index)}>
                <Text style={styles.saveButtonText}>{habitStatus[index] ? "SAVED" : "SAVE WEEKLY HABIT"}</Text>
              </TouchableOpacity>
              {habitStatus[index] ? <Text style={styles.statusText}>{habitStatus[index]}</Text> : null}
            </View>
          ))}

          {result.dailyQuestSuggestions.length ? (
            <View style={[styles.row, { borderColor: "#F472B6" }]}>
              <Text style={[styles.rowLabel, { color: "#FBCFE8" }]}>SUGGESTED DAILY QUESTS</Text>
              {result.dailyQuestSuggestions.map((quest, index) => (
                <View key={index} style={styles.questItem}>
                  <Text style={styles.rowText}>{quest.title}</Text>
                  <Text style={styles.rowSubText}>
                    · {quest.durationMinutes} min · {quest.mode === "recovery" ? "Recovery" : "Progress"} · {quest.difficulty}
                  </Text>
                  {quest.reason ? <Text style={styles.rowSubText}>· {quest.reason}</Text> : null}
                  <TouchableOpacity style={styles.saveButtonSmall} onPress={() => void handleSaveQuest(quest, index)}>
                    <Text style={styles.saveButtonText}>{questStatus[index] === "Saved to today's Quest Board." ? "SAVED" : "SAVE TO TODAY'S QUESTS"}</Text>
                  </TouchableOpacity>
                  {questStatus[index] ? <Text style={styles.statusText}>{questStatus[index]}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}

          {result.lunaRecoveryNotes.length ? (
            <View style={[styles.row, { borderColor: "#475569" }]}>
              <Text style={[styles.rowLabel, { color: "#CBD5E1" }]}>LUNA'S RECOVERY NOTES</Text>
              {result.lunaRecoveryNotes.map((note, index) => (
                <Text key={index} style={styles.rowSubText}>· {note}</Text>
              ))}
            </View>
          ) : null}

          {result.nextBestAction ? (
            <View style={[styles.row, { borderColor: "#94A3B8" }]}>
              <Text style={[styles.rowLabel, { color: "#E2E8F0" }]}>NEXT BEST ACTION</Text>
              <Text style={styles.rowText}>{result.nextBestAction}</Text>
            </View>
          ) : null}

          {result.safetyNotes.length ? (
            <Text style={styles.disclaimerText}>{result.safetyNotes.join(" ")}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: "rgba(8, 13, 24, 0.95)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: "#334155",
  },
  panelTitle: {
    color: "#FDE047",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.5,
    textAlign: "center",
    marginBottom: 8,
  },
  helperText: { color: "#CBD5E1", fontSize: 11, lineHeight: 16, fontWeight: "700", textAlign: "center", marginBottom: 10 },
  promptInput: {
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 6,
    padding: 9,
    color: "#F1F5F9",
    fontSize: 12,
    fontWeight: "600",
    minHeight: 64,
    textAlignVertical: "top",
    backgroundColor: "rgba(15,23,42,0.7)",
    marginBottom: 10,
  },
  askButton: {
    borderWidth: 2,
    borderColor: "#FBBF24",
    borderRadius: 6,
    paddingVertical: 11,
    alignItems: "center",
    backgroundColor: "rgba(120,53,15,0.4)",
  },
  askButtonRow: { flexDirection: "row", alignItems: "center" },
  askButtonText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  errorText: { color: "#FCA5A5", fontSize: 11, lineHeight: 16, fontWeight: "700", textAlign: "center", marginTop: 8 },
  noticeText: { color: "#FCD34D", fontSize: 10, lineHeight: 15, fontWeight: "700", textAlign: "center", marginBottom: 8 },
  cacheNoticeRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 },
  cacheNoticeText: { color: "#94A3B8", fontSize: 10, lineHeight: 14, fontWeight: "700" },
  cacheRefreshLink: { color: "#FDE68A", fontSize: 10, fontWeight: "900", textDecorationLine: "underline" },
  resultStack: { marginTop: 10 },
  row: {
    borderWidth: 2,
    borderRadius: 6,
    padding: 9,
    marginBottom: 8,
    backgroundColor: "rgba(15,23,42,0.7)",
  },
  rowLabel: { fontFamily: pixelFont, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginBottom: 4 },
  rowText: { color: "#F1F5F9", fontSize: 12, lineHeight: 17, fontWeight: "700" },
  rowSubText: { color: "#94A3B8", fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 4 },
  questItem: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#334155" },
  saveButton: {
    marginTop: 8,
    borderWidth: 2,
    borderColor: "#A78BFA",
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
  disclaimerText: { color: "#64748B", fontSize: 9, lineHeight: 13, fontWeight: "600", marginTop: 4, textAlign: "center" },
});
