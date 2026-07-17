import { useCallback, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { BottomNav, type BottomNavRoute } from "./BottomNav";
import { useMobileFrame } from "../constants/mobileLayout";
import { uiAssets } from "../constants/uiAssets";
import { decideMemoryUpdateProposal, loadGuideConversation, sendGuideMessage } from "../lib/guideConversation";
import { friendlyAiUnavailableMessage } from "../lib/aiUnavailableMessages";
import type { GuideConversationTurn, GuideMemoryUpdateProposal, GuideName } from "../lib/agentTypes";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

type GuideConversationScreenProps = {
  guide: GuideName;
};

const GUIDE_CONFIG: Record<GuideName, { name: string; accent: string; accentSoft: string; navRoute: BottomNavRoute; placeholder: string; heroLabel: string; title: string }> = {
  evie: {
    name: "Evie",
    accent: "#22C55E",
    accentSoft: "#86EFAC",
    navRoute: "path",
    placeholder: "What's on your mind about your path?",
    heroLabel: "TALK TO EVIE",
    title: "ABOUT MY PATH",
  },
  luna: {
    name: "Luna",
    accent: "#A78BFA",
    accentSoft: "#E9D5FF",
    navRoute: "mind",
    placeholder: "What's feeling hard right now?",
    heroLabel: "TALK TO LUNA",
    title: "ABOUT WHAT FEELS HARD",
  },
};

/**
 * Shared guided-conversation screen for both Evie and Luna. Deliberately NOT an unrestricted
 * chatbot: the only way this screen can change stored memory is through an inline "Save
 * this?" proposal the user explicitly approves — it never creates/deletes a quest/habit.
 */
export function GuideConversationScreen({ guide }: GuideConversationScreenProps) {
  const router = useRouter();
  const mobile = useMobileFrame();
  const config = GUIDE_CONFIG[guide];
  const scrollRef = useRef<ScrollView>(null);

  const [turns, setTurns] = useState<GuideConversationTurn[]>([]);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [decisionStatus, setDecisionStatus] = useState<Record<string, string>>({});
  // Synchronous in-flight lock — belt-and-suspenders alongside the `loading` state/disabled
  // prop, so a rapid double-click/double-tap can never fire two overlapping AI calls.
  const inFlightRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const existing = await loadGuideConversation(guide);
        setTurns(existing);
      })();
    }, [guide])
  );

  async function handleSend() {
    if (inFlightRef.current || !messageText.trim()) return;
    inFlightRef.current = true;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const outcome = await sendGuideMessage(guide, messageText);
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      setMessageText("");
      setTurns((prev) => [...prev, outcome.userTurn, outcome.guideTurn]);
      if (outcome.aiUnavailableReason) {
        setNotice(friendlyAiUnavailableMessage(outcome.aiUnavailableReason, config.name));
      }
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }

  async function handleDecision(turn: GuideConversationTurn, proposal: GuideMemoryUpdateProposal, decision: "approved" | "dismissed") {
    const outcome = await decideMemoryUpdateProposal(guide, turn.id, proposal.id, decision);
    setTurns((prev) =>
      prev.map((t) =>
        t.id !== turn.id
          ? t
          : {
              ...t,
              memoryUpdateProposals: (t.memoryUpdateProposals ?? []).map((p) =>
                p.id !== proposal.id ? p : { ...p, decision, decidedAt: new Date().toISOString() }
              ),
            }
      )
    );
    setDecisionStatus((prev) => ({
      ...prev,
      [proposal.id]: decision === "approved" ? (outcome.ok ? "Saved." : "Could not save.") : "Dismissed.",
    }));
  }

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={uiAssets.backgrounds.neutral} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <ScrollView
            ref={scrollRef}
            style={styles.screenScroller}
            contentContainerStyle={[styles.hudContent, { paddingBottom: mobile.scrollPaddingBottom }]}
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Text style={[styles.backButtonText, { color: config.accentSoft }]}>‹ Back</Text>
            </TouchableOpacity>

            <View style={[styles.hero, { borderColor: config.accent }]}>
              <Image source={uiAssets.guides[guide]} style={[styles.avatar, { borderColor: config.accent }]} resizeMode="contain" />
              <View style={styles.heroCopy}>
                <Text style={[styles.heroLabel, { color: config.accentSoft }]}>{config.heroLabel}</Text>
                <Text style={styles.title}>{config.title}</Text>
              </View>
            </View>

            <Text style={styles.disclaimerText}>
              {config.name} offers guidance, not medical or therapy advice. Nothing here changes your quests or habits without you approving it.
            </Text>

            <View style={styles.conversationStack}>
              {turns.map((turn) => (
                <View key={turn.id} style={[styles.bubble, turn.role === "user" ? styles.userBubble : [styles.guideBubble, { borderColor: config.accent }]]}>
                  <Text style={styles.bubbleText}>{turn.text}</Text>

                  {(turn.memoryUpdateProposals ?? []).map((proposal) => (
                    <View key={proposal.id} style={[styles.proposalCard, { borderColor: config.accent }]}>
                      <Text style={[styles.proposalText, { color: config.accentSoft }]}>{proposal.summary}</Text>
                      {proposal.decision ? (
                        <Text style={styles.proposalStatus}>{decisionStatus[proposal.id] ?? (proposal.decision === "approved" ? "Saved." : "Dismissed.")}</Text>
                      ) : (
                        <View style={styles.proposalActions}>
                          <TouchableOpacity style={[styles.proposalButton, { borderColor: config.accent }]} onPress={() => void handleDecision(turn, proposal, "approved")}>
                            <Text style={styles.proposalButtonText}>SAVE</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.proposalButtonSecondary} onPress={() => void handleDecision(turn, proposal, "dismissed")}>
                            <Text style={styles.proposalButtonSecondaryText}>NOT NOW</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              ))}
            </View>

            {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.composer}>
              <TextInput
                style={[styles.composerInput, { borderColor: config.accent }]}
                multiline
                placeholder={config.placeholder}
                placeholderTextColor="#64748B"
                value={messageText}
                onChangeText={setMessageText}
              />
              <TouchableOpacity
                style={[styles.sendButton, { borderColor: config.accent }, (loading || !messageText.trim()) && styles.sendButtonDisabled]}
                onPress={() => void handleSend()}
                disabled={loading || !messageText.trim()}
              >
                {loading ? <ActivityIndicator color="#F8FAFC" /> : <Text style={styles.sendButtonText}>SEND</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>

          <BottomNav activeRoute={config.navRoute} bottomOffset={mobile.bottomNavOffset} />
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
    borderColor: "rgba(251, 191, 36, 0.64)",
    shadowColor: "#000",
    shadowOpacity: 0.85,
    shadowRadius: 0,
    shadowOffset: { width: 6, height: 6 },
  },
  phoneStageFullscreen: { borderWidth: 0, shadowOpacity: 0 },
  backgroundLayer: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  backgroundImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  worldOverlay: { flex: 1, backgroundColor: "rgba(4, 8, 14, 0.12)" },
  screenScroller: { flex: 1 },
  hudContent: { paddingTop: 18, paddingHorizontal: 12, paddingBottom: 82 },
  backButton: { marginBottom: 10, alignSelf: "flex-start" },
  backButtonText: { fontFamily: pixelFont, fontSize: 13, fontWeight: "900" },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(46,32,20, 0.9)",
    borderWidth: 3,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, marginRight: 12, backgroundColor: "rgba(46,32,20,0.6)" },
  heroCopy: { flex: 1 },
  heroLabel: { fontFamily: pixelFont, fontSize: 12, fontWeight: "900", letterSpacing: 1, marginBottom: 4 },
  title: { color: "#F9FAFB", fontFamily: pixelFont, fontSize: 16, fontWeight: "900", letterSpacing: 0.5 },
  disclaimerText: { color: "#94A3B8", fontSize: 10, lineHeight: 14, fontWeight: "600", textAlign: "center", marginBottom: 14 },
  conversationStack: { gap: 8, marginBottom: 12 },
  bubble: { borderWidth: 2, borderRadius: 8, padding: 10, maxWidth: "92%" },
  userBubble: { alignSelf: "flex-end", backgroundColor: "rgba(120,53,15,0.35)", borderColor: "#FBBF24" },
  guideBubble: { alignSelf: "flex-start", backgroundColor: "rgba(46,32,20,0.7)" },
  bubbleText: { color: "#F1F5F9", fontSize: 13, lineHeight: 18, fontWeight: "600" },
  proposalCard: { marginTop: 8, borderWidth: 2, borderRadius: 6, padding: 8, backgroundColor: "rgba(46,32,20,0.6)" },
  proposalText: { fontSize: 11, lineHeight: 16, fontWeight: "700" },
  proposalActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  proposalButton: { flex: 1, borderWidth: 2, borderRadius: 6, paddingVertical: 8, alignItems: "center", backgroundColor: "rgba(22,101,52,0.4)" },
  proposalButtonText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 10, fontWeight: "900" },
  proposalButtonSecondary: { flex: 1, borderWidth: 2, borderColor: "#475569", borderRadius: 6, paddingVertical: 8, alignItems: "center", backgroundColor: "rgba(46,32,20,0.6)" },
  proposalButtonSecondaryText: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 10, fontWeight: "900" },
  proposalStatus: { color: "#FDE68A", fontSize: 10, fontWeight: "700", marginTop: 6 },
  errorText: { color: "#FCA5A5", fontSize: 11, lineHeight: 16, fontWeight: "700", textAlign: "center", marginBottom: 8 },
  noticeText: { color: "#FCD34D", fontSize: 10, lineHeight: 15, fontWeight: "700", textAlign: "center", marginBottom: 8 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  composerInput: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 6,
    padding: 9,
    color: "#F1F5F9",
    fontSize: 12,
    fontWeight: "600",
    minHeight: 44,
    maxHeight: 100,
    textAlignVertical: "top",
    backgroundColor: "rgba(46,32,20,0.7)",
  },
  sendButton: { borderWidth: 2, borderRadius: 6, paddingVertical: 12, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(46,32,20,0.9)" },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
});
