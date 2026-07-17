import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { BottomNav } from "../components/BottomNav";
import { FormScreen } from "../components/FormScreen";
import { formPageContent } from "../constants/formStyles";
import { useMobileFrame } from "../constants/mobileLayout";
import { uiAssets } from "../constants/uiAssets";
import type { GuideContextRecord } from "../lib/agentTypes";
import { loadGuideContextRecords, revokeGuideContext } from "../lib/guideContext";
import { runBoundedGuideOrchestration } from "../lib/guideOrchestration";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

function whenLabel(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "";
  return new Date(parsed).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function sourceLabel(type: GuideContextRecord["sourceType"]): string {
  switch (type) {
    case "journal": return "Journal";
    case "reflection": return "Reflection";
    case "dream": return "Dream Journal";
    case "preSleepIntention": return "Pre-Sleep Intention";
    case "morningIntentionReflection": return "Morning Reflection";
    case "awarenessCheck": return "Meditation";
    case "affirmation": return "Affirmation";
    case "lifeProfile": return "Life Profile — Recovery";
    case "pathGoal": return "Life Profile — Path Goals";
    default: return type;
  }
}

/** Every "Feed to Luna" / "Feed to Evie" grant the user has ever made, active and revoked
 *  alike, with a REMOVE action for anything still active. This is the "allow the user to
 *  remove it later" half of the consent flow — see components/FeedToGuideModal.tsx for where
 *  a grant is created. */
export default function GuideContextScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();
  const [records, setRecords] = useState<GuideContextRecord[]>([]);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInResult, setCheckInResult] = useState<string>("");
  const lastCheckInAtRef = useRef(0);
  const CHECK_IN_COOLDOWN_MS = 30_000;

  const load = useCallback(async () => {
    const all = await loadGuideContextRecords();
    setRecords([...all].sort((a, b) => new Date(b.permissionGrantedAt).getTime() - new Date(a.permissionGrantedAt).getTime()));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function handleRevoke(id: string) {
    const next = await revokeGuideContext(id);
    setRecords([...next].sort((a, b) => new Date(b.permissionGrantedAt).getTime() - new Date(a.permissionGrantedAt).getTime()));
  }

  /** ONE bounded orchestration pass, run only when the user explicitly asks for it here —
   *  never automatically or on a timer. Luna reads whatever's currently permitted and responds;
   *  Evie only runs as a second step if Luna handed off AND Evie-permitted context also exists.
   *  Results save into the same existing sessions Talk to Luna / your Path page already read,
   *  so nothing here bypasses the normal review-before-apply flow. */
  async function handleCheckIn() {
    if (checkingIn) return;
    // Lightweight client-side rate limit on this specific action — the shared AI routes
    // already have timeouts + deterministic fallback (see lib/lunaSupportModifier.ts /
    // lib/evieAiPathPipeline.ts), this just stops accidental double-taps from spending two
    // model calls for one intent.
    const now = Date.now();
    if (now - lastCheckInAtRef.current < CHECK_IN_COOLDOWN_MS) {
      setCheckInResult("Give it a few seconds before checking in again.");
      return;
    }
    lastCheckInAtRef.current = now;
    setCheckingIn(true);
    setCheckInResult("");
    try {
      const { luna, evie } = await runBoundedGuideOrchestration(
        "Please check in on how I'm doing lately and let me know if any plan changes would help."
      );
      if (!luna.ok) {
        setCheckInResult(luna.error);
      } else if (evie) {
        setCheckInResult(
          evie.ok
            ? "Luna responded, and Evie has proposed some quest changes to review — open Talk to Luna and your Path page to see them."
            : "Luna responded — open Talk to Luna to see her response. Evie's follow-up couldn't be reached this time."
        );
      } else {
        setCheckInResult("Luna responded — open Talk to Luna to see her response.");
      }
    } finally {
      setCheckingIn(false);
    }
  }

  const active = records.filter((r) => !r.revokedAt);
  const revoked = records.filter((r) => r.revokedAt);

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={uiAssets.backgrounds.neutral} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <FormScreen scrollPaddingBottom={mobile.formScrollPaddingBottom} contentContainerStyle={[formPageContent, styles.hudContent]}>
            <View style={styles.hero}>
              <Text style={styles.heroKicker}>YOUR ACCOUNT</Text>
              <Text style={styles.title}>📜 GUIDE CONTEXT</Text>
              <Text style={styles.subtitle}>Everything you&apos;ve explicitly shared with Luna or Evie. Remove anything, any time.</Text>
            </View>

            {active.length > 0 ? (
              <TouchableOpacity style={styles.checkInBtn} disabled={checkingIn} onPress={handleCheckIn}>
                <Text style={styles.checkInBtnText}>{checkingIn ? "CHECKING IN…" : "CHECK IN WITH YOUR GUIDES"}</Text>
              </TouchableOpacity>
            ) : null}
            {checkInResult ? <Text style={styles.checkInResult}>{checkInResult}</Text> : null}

            {active.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>Nothing shared yet. Use &quot;Feed to Luna&quot; or &quot;Feed to Evie&quot; from an entry to give a guide context.</Text>
              </View>
            ) : (
              active.map((record) => (
                <View
                  key={record.id}
                  style={[styles.entryCard, { borderLeftWidth: 6, borderLeftColor: record.guide === "luna" ? "#A78BFA" : "#22C55E" }]}
                >
                  <View style={styles.entryTopRow}>
                    <Image source={record.guide === "luna" ? uiAssets.guides.luna : uiAssets.guides.evie} style={styles.avatar} resizeMode="contain" />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.entryLabel, { color: record.guide === "luna" ? "#5B21B6" : "#14532D" }]}>
                        {record.guide === "luna" ? "Luna" : "Evie"} · {sourceLabel(record.sourceType)}
                      </Text>
                      <Text style={styles.entryWhen}>Shared {whenLabel(record.permissionGrantedAt)}</Text>
                    </View>
                  </View>
                  <Text style={styles.entryBody} numberOfLines={3}>{record.sourceTextSnapshot}</Text>
                  <TouchableOpacity style={styles.removeBtn} onPress={() => handleRevoke(record.id)}>
                    <Text style={styles.removeBtnText}>REMOVE ACCESS</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}

            {revoked.length > 0 ? (
              <>
                <Text style={styles.revokedHeading}>REMOVED ({revoked.length})</Text>
                {revoked.map((record) => (
                  <View key={record.id} style={styles.revokedCard}>
                    <Text style={styles.revokedText}>{record.guide === "luna" ? "Luna" : "Evie"} · {sourceLabel(record.sourceType)} — no longer shared</Text>
                  </View>
                ))}
              </>
            ) : null}

            <TouchableOpacity style={styles.backButton} onPress={() => router.push("/stats")}>
              <Text style={styles.backButtonText}>← Back to Stats</Text>
            </TouchableOpacity>
          </FormScreen>
          <BottomNav activeRoute="stats" bottomOffset={mobile.bottomNavOffset} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: { flex: 1, backgroundColor: "#140F0A" },
  phoneStage: {
    alignSelf: "center",
    backgroundColor: "#1C1410",
    overflow: "hidden",
    position: "relative",
    borderWidth: 2,
    borderColor: "rgba(167, 139, 250, 0.64)",
    shadowColor: "#000",
    shadowOpacity: 0.85,
    shadowRadius: 0,
    shadowOffset: { width: 6, height: 6 },
  },
  phoneStageFullscreen: { borderWidth: 0, maxWidth: undefined, aspectRatio: undefined, shadowOpacity: 0 },
  backgroundLayer: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  backgroundImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  worldOverlay: { flex: 1, backgroundColor: "rgba(4, 8, 14, 0.22)" },
  hudContent: { paddingTop: 8 },
  hero: {
    backgroundColor: "#EAD9B6",
    borderWidth: 3,
    borderColor: "#5C4425",
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.68,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  heroKicker: { color: "#7C5B2B", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", letterSpacing: 2, marginBottom: 8 },
  title: { color: "#4A3620", fontFamily: pixelFont, fontSize: 26, fontWeight: "900", letterSpacing: 1, lineHeight: 32, textAlign: "center" },
  subtitle: { color: "#7C5B2B", fontFamily: pixelFont, fontSize: 12, fontWeight: "800", lineHeight: 18, marginTop: 8 },
  checkInBtn: {
    borderWidth: 3,
    borderColor: "#4C1D95",
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: "#7C3AED",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 },
  },
  checkInBtnText: { color: "#FFFFFF", fontFamily: pixelFont, fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  checkInResult: { color: "#E9D5FF", fontFamily: pixelFont, fontSize: 11, lineHeight: 16, fontWeight: "700", marginBottom: 16 },
  emptyCard: { backgroundColor: "#EAD9B6", borderWidth: 3, borderColor: "#5C4425", borderRadius: 8, padding: 14, marginBottom: 16, shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 0, shadowOffset: { width: 3, height: 3 } },
  emptyText: { color: "#4A3620", fontFamily: pixelFont, fontSize: 12, lineHeight: 18, fontWeight: "800" },
  entryCard: { backgroundColor: "#EAD9B6", borderWidth: 3, borderColor: "#5C4425", borderRadius: 8, padding: 12, marginBottom: 10, shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 0, shadowOffset: { width: 3, height: 3 } },
  entryTopRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  avatar: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: "#5C4425" },
  entryLabel: { color: "#5B21B6", fontFamily: pixelFont, fontSize: 13, fontWeight: "900" },
  entryWhen: { color: "#8A7554", fontFamily: pixelFont, fontSize: 10, fontWeight: "800", marginTop: 2 },
  entryBody: { color: "#3D2C18", fontFamily: pixelFont, fontSize: 12, fontWeight: "700", lineHeight: 17, marginBottom: 8 },
  removeBtn: { borderWidth: 2, borderColor: "#92400E", borderRadius: 6, paddingVertical: 8, alignItems: "center", backgroundColor: "rgba(146,64,14,0.16)" },
  removeBtnText: { color: "#92400E", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  revokedHeading: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 0.8, marginTop: 8, marginBottom: 6 },
  revokedCard: { backgroundColor: "rgba(46,32,20, 0.7)", borderWidth: 1, borderColor: "#5C4425", borderRadius: 6, padding: 8, marginBottom: 6 },
  revokedText: { color: "#64748B", fontFamily: pixelFont, fontSize: 10, fontWeight: "700" },
  backButton: { backgroundColor: "rgba(46,32,20, 0.94)", borderWidth: 2, borderColor: "#5C4425", borderRadius: 6, paddingVertical: 13, alignItems: "center", marginTop: 10 },
  backButtonText: { color: "#F9FAFB", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
});
