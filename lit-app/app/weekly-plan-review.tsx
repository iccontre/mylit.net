import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { BottomNav } from "../components/BottomNav";
import { FormScreen } from "../components/FormScreen";
import { GuidePanel } from "../components/parchment/GuidePanel";
import { ParchmentField } from "../components/parchment/ParchmentField";
import { ParchmentSurface, parchmentTextStyles } from "../components/parchment/ParchmentSurface";
import { SaveButton, type SaveState } from "../components/parchment/SaveButton";
import { WorldChrome } from "../components/parchment/WorldChrome";
import { formPageContent } from "../constants/formStyles";
import { useMobileFrame } from "../constants/mobileLayout";
import { hubPalettes } from "../constants/worldTokens";
import { uiAssets } from "../constants/uiAssets";
import {
  acceptFullWeeklyPlan,
  acceptWeeklyPlanDay,
  defaultTargetWeekStart,
  editWeeklyPlanProposal,
  generateWeeklyPlan,
  loadWeeklyPlanDraft,
  regenerateWeeklyPlanDay,
  removeWeeklyPlanProposal,
  type WeeklyPlanDraft,
} from "../lib/weeklyPlanGeneration";
import type { GeneratedQuestProposal } from "../lib/agentTypes";

const palette = hubPalettes.path;
const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`);
  return `${WEEKDAY_SHORT[d.getDay()]} · ${d.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

function buildWeekDates(weekStart: string): string[] {
  const monday = new Date(`${weekStart}T00:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
}

export default function WeeklyPlanReviewScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();
  const weekStart = useMemo(() => defaultTargetWeekStart(), []);
  const weekDates = useMemo(() => buildWeekDates(weekStart), [weekStart]);

  const [draft, setDraft] = useState<WeeklyPlanDraft | null>(null);
  const [genState, setGenState] = useState<"idle" | "generating" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [dayBusy, setDayBusy] = useState<string | null>(null);
  const [editingProposalId, setEditingProposalId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [acceptAllState, setAcceptAllState] = useState<SaveState>("idle");
  const [doneMessage, setDoneMessage] = useState("");

  useEffect(() => {
    void loadWeeklyPlanDraft(weekStart).then((existing) => {
      if (existing) {
        setDraft(existing);
        setGenState("ready");
      }
    });
  }, [weekStart]);

  async function handleGenerate() {
    setGenState("generating");
    setError("");
    const result = await generateWeeklyPlan(weekStart);
    if (!result.ok) {
      setGenState("error");
      setError(result.error);
      return;
    }
    setDraft(result.draft);
    setGenState("ready");
  }

  async function handleRegenerateDay(dateKey: string) {
    setDayBusy(dateKey);
    const result = await regenerateWeeklyPlanDay(weekStart, dateKey);
    setDayBusy(null);
    if (result.ok) setDraft(result.draft);
  }

  async function handleAcceptDay(dateKey: string) {
    setDayBusy(dateKey);
    await acceptWeeklyPlanDay(weekStart, dateKey);
    const refreshed = await loadWeeklyPlanDraft(weekStart);
    setDraft(refreshed);
    setDayBusy(null);
  }

  async function handleAcceptFullWeek() {
    if (acceptAllState === "saving" || acceptAllState === "saved") return;
    setAcceptAllState("saving");
    try {
      const { accepted } = await acceptFullWeeklyPlan(weekStart);
      setAcceptAllState("saved");
      setDoneMessage(accepted > 0 ? `${accepted} quests added to your week.` : "Your week is set.");
      const refreshed = await loadWeeklyPlanDraft(weekStart);
      setDraft(refreshed);
    } catch {
      setAcceptAllState("error");
    }
  }

  async function handleRemove(proposalId: string) {
    const next = await removeWeeklyPlanProposal(weekStart, proposalId);
    if (next) setDraft(next);
  }

  function startEditing(proposal: GeneratedQuestProposal) {
    setEditingProposalId(proposal.proposalId);
    setEditTitle(proposal.title);
  }

  async function saveEdit(proposalId: string) {
    const next = await editWeeklyPlanProposal(weekStart, proposalId, { title: editTitle });
    if (next) setDraft(next);
    setEditingProposalId(null);
  }

  const proposalsByDate = new Map<string, GeneratedQuestProposal[]>();
  for (const p of draft?.proposals ?? []) {
    if (!p.targetDateKey) continue;
    const list = proposalsByDate.get(p.targetDateKey) ?? [];
    list.push(p);
    proposalsByDate.set(p.targetDateKey, list);
  }

  const remainingCount = draft?.proposals.length ?? 0;

  function renderProposal(p: GeneratedQuestProposal) {
    const isEditing = editingProposalId === p.proposalId;
    return (
      <View key={p.proposalId} style={[styles.proposalCard, p.mode === "recovery" ? styles.recoveryCard : styles.progressCard]}>
        <Text style={styles.proposalHeader}>{p.mode === "recovery" ? "🌙 RECOVERY · LUNA" : "🌲 PROGRESS · EVIE"}</Text>
        {isEditing ? (
          <ParchmentField value={editTitle} onChangeText={setEditTitle} style={styles.editField} />
        ) : (
          <Text style={parchmentTextStyles.body}>{p.title}</Text>
        )}
        <Text style={parchmentTextStyles.meta}>
          {p.durationMinutes} min · Energy {p.energyCost >= 0 ? "+" : ""}{p.energyCost} · {p.sourceLabel}
        </Text>
        <Text style={styles.rationale}>{p.rationale}</Text>
        <View style={styles.proposalActions}>
          {isEditing ? (
            <TouchableOpacity style={styles.smallBtn} onPress={() => void saveEdit(p.proposalId)}>
              <Text style={styles.smallBtnText}>DONE</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.smallBtn} onPress={() => startEditing(p)}>
              <Text style={styles.smallBtnText}>EDIT</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.smallBtnMuted} onPress={() => void handleRemove(p.proposalId)}>
            <Text style={styles.smallBtnMutedText}>REMOVE</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen, { borderColor: palette.edge }]}>
        <FormScreen scrollPaddingBottom={mobile.formScrollPaddingBottom} contentContainerStyle={[formPageContent, styles.hudContent]}>
          <WorldChrome hub="path" kicker="YOUR FIRST WEEK" title="WEEKLY PLAN" subtitle="Review before anything is scheduled." style={styles.chrome} />

          <GuidePanel
            hub="path"
            guideName="Evie"
            guideAvatar={uiAssets.guides.evie}
            message="Luna and I built this together — edit or remove anything before it goes on your board."
          />

          {genState === "idle" ? (
            <ParchmentSurface accent="path" title="✨ GENERATE MY FIRST WEEK" style={styles.card}>
              <Text style={parchmentTextStyles.body}>Evie and Luna will build a plan for you to review.</Text>
              <SaveButton state="idle" onPress={() => void handleGenerate()} idleLabel="GENERATE MY FIRST WEEK" style={styles.generateBtn} />
            </ParchmentSurface>
          ) : null}

          {genState === "generating" ? (
            <ParchmentSurface accent="path" style={styles.card}>
              <Text style={parchmentTextStyles.body}>Building your week…</Text>
            </ParchmentSurface>
          ) : null}

          {genState === "error" ? (
            <ParchmentSurface accent="path" style={styles.card}>
              <Text style={parchmentTextStyles.body}>{error || "Couldn't build a plan right now."}</Text>
              <SaveButton state="idle" onPress={() => void handleGenerate()} idleLabel="TRY AGAIN" style={styles.generateBtn} />
            </ParchmentSurface>
          ) : null}

          {genState === "ready" && draft ? (
            <>
              {weekDates.map((dateKey) => {
                const dayProposals = proposalsByDate.get(dateKey) ?? [];
                const busy = dayBusy === dateKey;
                return (
                  <ParchmentSurface key={dateKey} accent="path" kicker={dayLabel(dateKey)} style={styles.card}>
                    {dayProposals.length === 0 ? (
                      <Text style={parchmentTextStyles.meta}>Accepted, or nothing planned for this day.</Text>
                    ) : (
                      <>
                        {dayProposals.map(renderProposal)}
                        <View style={styles.dayActions}>
                          <TouchableOpacity style={styles.smallBtn} disabled={busy} onPress={() => void handleRegenerateDay(dateKey)}>
                            <Text style={styles.smallBtnText}>{busy ? "…" : "REGENERATE DAY"}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.acceptDayBtn} disabled={busy} onPress={() => void handleAcceptDay(dateKey)}>
                            <Text style={styles.acceptDayBtnText}>ACCEPT DAY</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </ParchmentSurface>
                );
              })}

              {remainingCount > 0 ? (
                <SaveButton
                  state={acceptAllState}
                  onPress={() => void handleAcceptFullWeek()}
                  idleLabel="ACCEPT FULL WEEK"
                  style={styles.generateBtn}
                />
              ) : (
                <ParchmentSurface accent="path" style={styles.card}>
                  <Text style={parchmentTextStyles.body}>{doneMessage || "Your week is set."}</Text>
                </ParchmentSurface>
              )}
            </>
          ) : null}

          <TouchableOpacity style={styles.backButton} onPress={() => router.replace("/(tabs)")}>
            <Text style={styles.backButtonText}>Skip for now — go to Home</Text>
          </TouchableOpacity>
        </FormScreen>

        <BottomNav activeRoute="path" bottomOffset={mobile.bottomNavOffset} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: { flex: 1, backgroundColor: "#0E1B12" },
  phoneStage: { alignSelf: "center", backgroundColor: "#12261A", overflow: "hidden", position: "relative", borderWidth: 2 },
  phoneStageFullscreen: { borderWidth: 0, maxWidth: undefined, aspectRatio: undefined },
  hudContent: { flexGrow: 1, paddingTop: 16, paddingHorizontal: 14, paddingBottom: 24 },
  chrome: { marginBottom: 12 },
  card: { marginTop: 12 },
  generateBtn: { marginTop: 12 },
  proposalCard: { borderWidth: 2, borderRadius: 7, padding: 10, marginTop: 8 },
  progressCard: { backgroundColor: "#F4E8CE", borderColor: "#92610A" },
  recoveryCard: { backgroundColor: "#EDE4FB", borderColor: "#7C3AED" },
  proposalHeader: { fontFamily: pixelFont, fontSize: 10, fontWeight: "900", letterSpacing: 0.5, marginBottom: 4, color: "#4A3620" },
  rationale: { fontFamily: pixelFont, fontSize: 10, fontStyle: "italic", color: "#7C5B2B", marginTop: 4 },
  editField: { marginBottom: 2 },
  proposalActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  dayActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  smallBtn: { flex: 1, borderWidth: 2, borderColor: "#5C4425", borderRadius: 6, paddingVertical: 8, alignItems: "center", backgroundColor: "#E7D3A9" },
  smallBtnText: { fontFamily: pixelFont, fontSize: 10, fontWeight: "900", color: "#4A3620" },
  smallBtnMuted: { flex: 1, borderWidth: 2, borderColor: "#5C4425", borderRadius: 6, paddingVertical: 8, alignItems: "center", backgroundColor: "transparent" },
  smallBtnMutedText: { fontFamily: pixelFont, fontSize: 10, fontWeight: "900", color: "#7C5B2B" },
  acceptDayBtn: { flex: 1, borderWidth: 3, borderColor: "#14532D", borderRadius: 6, paddingVertical: 8, alignItems: "center", backgroundColor: "#16A34A" },
  acceptDayBtnText: { fontFamily: pixelFont, fontSize: 10, fontWeight: "900", color: "#FFFFFF" },
  backButton: { marginTop: 14, alignItems: "center", paddingVertical: 10 },
  backButtonText: { color: "#EAF7EA", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
});
