import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { GuideInfoModal } from "../components/GuideInfoModal";
import { GuideFoundationCard } from "../components/GuideFoundationCard";
import { FeedToGuideButton } from "../components/parchment/FeedToGuideButton";
import { EvieGuideModal } from "../components/EvieGuideModal";
import { LunaGuideModal } from "../components/LunaGuideModal";
import { GOAL_HORIZON_LABELS } from "../constants/goalMilestoneTemplates";
import { BottomNav } from "../components/BottomNav";
import { useMobileFrame } from "../constants/mobileLayout";
import { uiAssets } from "../constants/uiAssets";

const EVIE_PATH_BULLETS = [
  "Path sets your direction. Short, mid, and long-term goals are benchmarks — not single-day quests.",
  "Short-term = around 2 weeks. Mid-term = around 1 month. Long-term = around 3 months.",
  "Your category and resources help MYLIT choose better quests and checklist habits.",
  "Progress Meaning is your personal definition of moving forward.",
  "Updating the path does not reset your progress.",
  "Set My Path opens path setup — it does not reset the whole app.",
  "Tap Start Next Chapter when you are ready to change direction.",
];

type UserProfile = {
  name: string;
  longTermDream?: string;
  dreamCategory?: string;
  supplementaryCategory?: string;
  progressMeaning: string;
  // Phase 1 tiered goals
  specificGoal?: string;
  shortTermGoal?: string;
  midTermGoal?: string;
  longTermGoal?: string;
  // Legacy flat fields, kept for backward compat with older saved profiles
  goalOne?: string;
  goalTwo?: string;
  goalThree?: string;
  biggestObstacle?: string;
  hasWorkOrSchool?: boolean;
  hasTransportation?: boolean;
  hasGymAccess?: boolean;
  hasQuietSpace?: boolean;
  hasFoodControl?: boolean;
};

type SummaryCard = {
  label: string;
  value: string;
  icon: string;
};

type MilestoneCard = {
  label: string;
  caption: string;
  text: string;
  icon: string;
  tone: "gold" | "green";
};

const PROFILE_KEY = "lit_user_profile";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

export default function PathScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showEvieModal, setShowEvieModal] = useState(false);
  const [showLunaModal, setShowLunaModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const saved = await AsyncStorage.getItem(PROFILE_KEY);
    if (saved) {
      setProfile(JSON.parse(saved));
    }
  }

  const longTermDream = profile?.longTermDream?.trim() || "Not set yet";
  const dreamCategory = profile?.dreamCategory?.trim() || "Not set yet";
  const supplementaryCategory = profile?.supplementaryCategory?.trim() || "";
  const specificGoal = profile?.specificGoal?.trim() || "Not set yet";
  // Prefer the new tiered fields, fall back to legacy goalOne / Two / Three
  // for users whose profile was saved before the tiered flow existed.
  const shortTermGoal =
    profile?.shortTermGoal?.trim() || profile?.goalOne?.trim() || "Not set yet";
  const midTermGoal =
    profile?.midTermGoal?.trim() || profile?.goalTwo?.trim() || "Not set yet";
  const longTermGoal =
    profile?.longTermGoal?.trim() || profile?.goalThree?.trim() || "Not set yet";
  const progressMeaning = profile?.progressMeaning?.trim() || "Not set yet";

  const summaryCards: SummaryCard[] = [
    { label: "Long-Term Dream", value: longTermDream, icon: "📕" },
    { label: "Main Path", value: dreamCategory, icon: "🍃" },
    ...(supplementaryCategory ? [{ label: "Supplementary Path", value: supplementaryCategory, icon: "🌱" }] : []),
    { label: "Specific Goal", value: specificGoal, icon: "🎯" },
  ];

  const milestones: MilestoneCard[] = [
    {
      label: GOAL_HORIZON_LABELS.longTerm.label,
      caption: GOAL_HORIZON_LABELS.longTerm.caption,
      text: longTermGoal,
      icon: "🏆",
      tone: "gold",
    },
    {
      label: GOAL_HORIZON_LABELS.midTerm.label,
      caption: GOAL_HORIZON_LABELS.midTerm.caption,
      text: midTermGoal,
      icon: "🏳️",
      tone: "green",
    },
    {
      label: GOAL_HORIZON_LABELS.shortTerm.label,
      caption: GOAL_HORIZON_LABELS.shortTerm.caption,
      text: shortTermGoal,
      icon: "📍",
      tone: "green",
    },
  ];

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={uiAssets.backgrounds.default} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <ScrollView
            style={styles.screenScroller}
            contentContainerStyle={[styles.hudContent, { paddingBottom: mobile.scrollPaddingBottom }]}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.hero}>
              <View style={styles.heroCopy}>
                <Text style={styles.heroLabel}>PATH BOARD</Text>
                <Text style={styles.title}>PATH</Text>
                <Text style={styles.subtitle}>
                  Keep your direction visible and update it when life changes.
                </Text>
              </View>
            </View>

            <View style={styles.evieCard}>
              <Image source={uiAssets.guides.evie} style={styles.evieAvatar} resizeMode="contain" />
              <View style={styles.evieCopy}>
                <Text style={styles.evieName}>Evie</Text>
                <Text style={styles.evieText}>
                  This is your current path. Keep it visible, update it when life changes, and let it shape your quests.
                </Text>
              </View>
              <TouchableOpacity style={styles.infoBtn} onPress={() => setShowInfo(true)}>
                <Text style={styles.infoBtnText}>?</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.summaryStack}>
              {summaryCards.map((card) => (
                <View key={card.label} style={styles.summaryCard}>
                  <View style={styles.summaryIconBox}>
                    <Text style={styles.summaryIcon}>{card.icon}</Text>
                  </View>
                  <View style={styles.summaryCopy}>
                    <Text style={styles.summaryLabel}>{card.label}</Text>
                    <Text style={styles.summaryValue}>{card.value}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.milestonesPanel}>
              <Text style={styles.milestonesTitle}>PATH MILESTONES</Text>
              <View style={styles.mapBody}>
                <View style={styles.routeColumn}>
                  <View style={styles.routeLine} />
                  {milestones.map((milestone, index) => (
                    <View key={milestone.label} style={styles.markerWrap}>
                      <View
                        style={[
                          styles.marker,
                          milestone.tone === "gold" ? styles.markerGold : styles.markerGreen,
                        ]}
                      >
                        <Text style={styles.markerText}>{milestone.icon}</Text>
                      </View>
                      {index < milestones.length - 1 ? <View style={styles.routeDash} /> : null}
                    </View>
                  ))}
                </View>

                <View style={styles.milestoneCards}>
                  {milestones.map((milestone) => (
                    <View key={milestone.label} style={styles.milestoneCard}>
                      <View style={styles.milestoneHeaderRow}>
                        <Text
                          style={[
                            styles.milestoneLabel,
                            milestone.tone === "gold" ? styles.milestoneGold : styles.milestoneGreen,
                          ]}
                        >
                          {milestone.label}
                        </Text>
                        <Text style={styles.milestoneCaption}>{milestone.caption}</Text>
                      </View>
                      <Text style={styles.goalText}>{milestone.text}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.meaningCard}>
              <View style={styles.meaningIconBox}>
                <Text style={styles.meaningIcon}>💖</Text>
              </View>
              <View style={styles.meaningCopy}>
                <Text style={styles.meaningLabel}>PROGRESS MEANING</Text>
                <Text style={styles.meaningText}>{progressMeaning}</Text>
              </View>
            </View>

            {profile?.progressMeaning?.trim() ? (
              <View style={styles.feedToEvieRow}>
                <FeedToGuideButton guide="evie" sourceType="pathGoal" sourceId="path-progress-meaning" sourceText={progressMeaning} />
              </View>
            ) : null}

            {profile && (
              <View style={styles.resourcesPanel}>
                <Text style={styles.resourcesTitle}>ACTIVE RESOURCES</Text>
                <View style={styles.resourceRow}>
                  {[
                    { key: "hasWorkOrSchool", label: "Work/School", icon: "📘" },
                    { key: "hasTransportation", label: "Transport", icon: "🚌" },
                    { key: "hasGymAccess", label: "Gym", icon: "🏋️" },
                    { key: "hasQuietSpace", label: "Quiet Space", icon: "🔇" },
                    { key: "hasFoodControl", label: "Food Control", icon: "🍽️" },
                  ].map((r) => {
                    const active = !!profile[r.key as keyof UserProfile];
                    return (
                      <View key={r.key} style={[styles.resourceChip, !active && styles.resourceChipOff]}>
                        <Text style={styles.resourceChipIcon}>{r.icon}</Text>
                        <Text style={[styles.resourceChipLabel, !active && styles.resourceChipLabelOff]}>{r.label}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            <TouchableOpacity style={styles.profileButton} onPress={() => setShowProfileModal(true)}>
              <Text style={styles.profileButtonText}>🧭 MYLIT PROFILE</Text>
            </TouchableOpacity>
            <Text style={styles.profileButtonNote}>View and edit the profile Evie and Luna use to guide your path.</Text>

            <View style={styles.guideButtonRow}>
              <TouchableOpacity style={[styles.guideButton, styles.guideButtonEvie]} onPress={() => setShowEvieModal(true)}>
                <Image source={uiAssets.guides.evie} style={styles.guideButtonAvatar} resizeMode="contain" />
                <Text style={styles.guideButtonLabel}>Evie</Text>
                <Text style={styles.guideButtonNote}>Access everything you want from Evie.</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.guideButton, styles.guideButtonLuna]} onPress={() => setShowLunaModal(true)}>
                <Image source={uiAssets.guides.luna} style={styles.guideButtonAvatar} resizeMode="contain" />
                <Text style={styles.guideButtonLabel}>Luna</Text>
                <Text style={styles.guideButtonNote}>Access everything you need from Luna.</Text>
              </TouchableOpacity>
            </View>

            <EvieGuideModal visible={showEvieModal} onClose={() => setShowEvieModal(false)} />
            <LunaGuideModal visible={showLunaModal} onClose={() => setShowLunaModal(false)} />

            <Modal visible={showProfileModal} transparent animationType="fade" onRequestClose={() => setShowProfileModal(false)}>
              <View style={styles.guideModalBackdrop}>
                <ScrollView style={styles.guideModalPanel} contentContainerStyle={styles.guideModalContent}>
                  <Text style={styles.guideModalTitle}>MYLIT PROFILE</Text>
                  <GuideFoundationCard />
                  <TouchableOpacity style={styles.secondaryActionButton} onPress={() => { setShowProfileModal(false); router.push("/life-profile"); }}>
                    <Text style={styles.actionIcon}>🧭</Text>
                    <Text style={styles.secondaryActionText}>Edit My Life Profile</Text>
                    <Text style={styles.secondaryActionArrow}>›</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.guideModalCloseBtn} onPress={() => setShowProfileModal(false)}>
                    <Text style={styles.guideModalCloseBtnText}>CLOSE</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </Modal>

            <TouchableOpacity
              style={styles.primaryActionButton}
              onPress={() => router.push({ pathname: "/onboarding", params: { mode: "editPath" } })}
            >
              <Text style={styles.actionIcon}>🗡️</Text>
              <Text style={styles.primaryActionText}>Set My Path</Text>
              <Text style={styles.actionArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryActionButton} onPress={() => router.push("/next-chapter")}>
              <Text style={styles.actionIcon}>🚩</Text>
              <Text style={styles.secondaryActionText}>Start Next Chapter</Text>
              <Text style={styles.secondaryActionArrow}>›</Text>
            </TouchableOpacity>
          </ScrollView>

          <GuideInfoModal
            visible={showInfo}
            onClose={() => setShowInfo(false)}
            guideAvatar={uiAssets.guides.evie}
            guideName="Evie"
            title="How Path Board Works"
            bullets={EVIE_PATH_BULLETS}
            accentColor="#22C55E"
          />

          <BottomNav activeRoute="path" bottomOffset={mobile.bottomNavOffset} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  guideButtonRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  guideButton: {
    flex: 1,
    borderWidth: 3,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  // Solid fills (not transparent) — Evie is gold/yellow, Luna is purple, per Path styling requirements.
  guideButtonEvie: { borderColor: "#B45309", backgroundColor: "#F8C84A" },
  guideButtonLuna: { borderColor: "#5B21B6", backgroundColor: "#A78BFA" },
  guideButtonAvatar: { width: 40, height: 40, marginBottom: 4 },
  guideButtonLabel: { color: "#1E1408", fontFamily: "monospace", fontSize: 14, fontWeight: "900", marginBottom: 3 },
  guideButtonNote: { color: "#241a05", fontSize: 10, lineHeight: 14, fontWeight: "700", textAlign: "center" },
  profileButton: {
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "rgba(15,23,42,0.6)",
    marginBottom: 4,
  },
  profileButtonText: { color: "#E2E8F0", fontFamily: "monospace", fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },
  profileButtonNote: { color: "#94A3B8", fontSize: 10, fontWeight: "700", textAlign: "center", marginBottom: 12 },
  guideModalBackdrop: { flex: 1, backgroundColor: "rgba(2,4,10,0.88)", padding: 18, paddingTop: 60, paddingBottom: 40 },
  guideModalPanel: { flex: 1, backgroundColor: "rgba(8,13,24,0.98)", borderWidth: 3, borderColor: "#334155", borderRadius: 12 },
  guideModalContent: { padding: 16 },
  guideModalTitle: { color: "#FDE047", fontFamily: "monospace", fontSize: 20, fontWeight: "900", textAlign: "center", marginBottom: 8, letterSpacing: 1 },
  guideModalIntro: { color: "#CBD5E1", fontSize: 12, lineHeight: 18, fontWeight: "700", textAlign: "center", marginBottom: 12 },
  guideModalPrimaryBtn: { borderWidth: 2, borderColor: "#FBBF24", borderRadius: 8, paddingVertical: 12, alignItems: "center", backgroundColor: "rgba(113,63,18,0.4)", marginBottom: 12 },
  guideModalPrimaryBtnText: { color: "#FDE68A", fontFamily: "monospace", fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },
  guideModalCloseBtn: { marginTop: 8, alignItems: "center", paddingVertical: 10 },
  guideModalCloseBtnText: { color: "#94A3B8", fontFamily: "monospace", fontSize: 11, fontWeight: "900" },
  pageRoot: {
    flex: 1,
    backgroundColor: "#02040A",
  },
  phoneStage: {
    alignSelf: "center",
    backgroundColor: "#050814",
    overflow: "hidden",
    position: "relative",
    borderWidth: 2,
    borderColor: "rgba(251, 191, 36, 0.64)",
    shadowColor: "#000",
    shadowOpacity: 0.85,
    shadowRadius: 0,
    shadowOffset: { width: 6, height: 6 },
  },
  phoneStageFullscreen: {
    borderWidth: 0,
    shadowOpacity: 0,
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  worldOverlay: {
    flex: 1,
    backgroundColor: "rgba(4, 8, 14, 0.05)",
  },
  screenScroller: {
    flex: 1,
  },
  hudContent: {
    minHeight: "100%",
    paddingTop: 18,
    paddingHorizontal: 12,
    paddingBottom: 82,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EAD9B6",
    borderWidth: 3,
    borderColor: "#14532D",
    borderLeftWidth: 6,
    borderLeftColor: "#22C55E",
    borderRadius: 8,
    paddingVertical: 15,
    paddingHorizontal: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.68,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  heroCopy: {
    flex: 1,
  },
  heroLabel: {
    color: "#14532D",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.8,
    marginBottom: 7,
  },
  title: {
    color: "#4A3620",
    fontFamily: pixelFont,
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: 4,
    lineHeight: 45,
    textAlign: "center",
  },
  subtitle: {
    color: "#7C5B2B",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 20,
    marginTop: 8,
  },
  evieCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EAD9B6",
    borderWidth: 3,
    borderColor: "#14532D",
    borderLeftWidth: 6,
    borderLeftColor: "#22C55E",
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 11,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 },
  },
  evieAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: "#14532D",
    backgroundColor: "#F4E8CE",
    marginRight: 10,
  },
  evieCopy: {
    flex: 1,
  },
  evieName: {
    color: "#14532D",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 4,
  },
  evieText: {
    color: "#4A3620",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
  infoBtn: {
    width: 26,
    height: 26,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#4ADE80",
    backgroundColor: "rgba(20, 83, 45, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  infoBtnText: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17,
  },
  resourcesPanel: {
    backgroundColor: "rgba(8, 13, 18, 0.86)",
    borderWidth: 2,
    borderColor: "rgba(74, 222, 128, 0.38)",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  resourcesTitle: {
    color: "#4ADE80",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 8,
  },
  resourceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  resourceChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(20, 83, 45, 0.82)",
    borderWidth: 1,
    borderColor: "#22C55E",
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 7,
    gap: 4,
  },
  resourceChipOff: {
    backgroundColor: "rgba(15, 23, 42, 0.60)",
    borderColor: "#3A4558",
    opacity: 0.5,
  },
  resourceChipIcon: {
    fontSize: 13,
  },
  resourceChipLabel: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "900",
  },
  resourceChipLabelOff: {
    color: "#64748B",
  },
  summaryStack: {
    width: "62%",
    gap: 8,
    marginBottom: 12,
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 70,
    backgroundColor: "rgba(8, 13, 18, 0.88)",
    borderWidth: 2,
    borderColor: "rgba(148, 163, 184, 0.48)",
    borderRadius: 8,
    padding: 8,
  },
  summaryIconBox: {
    height: 52,
    width: 52,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.78)",
    borderRadius: 6,
    marginRight: 10,
  },
  summaryIcon: {
    fontSize: 29,
  },
  summaryCopy: {
    flex: 1,
  },
  summaryLabel: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  summaryValue: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 19,
    marginTop: 4,
  },
  milestonesPanel: {
    backgroundColor: "rgba(8, 13, 18, 0.84)",
    borderWidth: 3,
    borderColor: "rgba(148, 163, 184, 0.52)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  milestonesTitle: {
    color: "#4ADE80",
    fontFamily: pixelFont,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1.3,
    marginBottom: 12,
  },
  mapBody: {
    flexDirection: "row",
  },
  routeColumn: {
    width: 58,
    alignItems: "center",
    position: "relative",
  },
  routeLine: {
    position: "absolute",
    top: 22,
    bottom: 28,
    width: 4,
    borderRadius: 2,
    backgroundColor: "rgba(251, 191, 36, 0.72)",
  },
  markerWrap: {
    height: 108,
    alignItems: "center",
  },
  marker: {
    height: 42,
    width: 42,
    borderRadius: 21,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    zIndex: 2,
  },
  markerGold: {
    borderColor: "#FBBF24",
  },
  markerGreen: {
    borderColor: "#22C55E",
  },
  markerText: {
    fontSize: 21,
  },
  routeDash: {
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: "rgba(251, 191, 36, 0.85)",
    marginTop: 20,
  },
  milestoneCards: {
    flex: 1,
    gap: 10,
  },
  milestoneCard: {
    minHeight: 98,
    backgroundColor: "rgba(8, 13, 18, 0.92)",
    borderWidth: 2,
    borderColor: "rgba(148, 163, 184, 0.46)",
    borderRadius: 8,
    padding: 11,
  },
  milestoneHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 7,
  },
  milestoneLabel: {
    flex: 1,
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  milestoneGold: {
    color: "#FDE68A",
  },
  milestoneGreen: {
    color: "#4ADE80",
  },
  milestoneCaption: {
    color: "#F8F1D7",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "800",
  },
  goalText: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
  },
  meaningCard: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EAD9B6",
    borderWidth: 3,
    borderColor: "#5C4425",
    borderLeftWidth: 6,
    borderLeftColor: "#22C55E",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 },
  },
  meaningIconBox: {
    height: 50,
    width: 50,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  meaningIcon: {
    fontSize: 33,
  },
  meaningCopy: {
    flex: 1,
  },
  meaningLabel: {
    color: "#92610A",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  meaningText: {
    color: "#4A3620",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 4,
  },
  feedToEvieRow: { marginBottom: 12 },
  primaryActionButton: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16A34A",
    borderWidth: 3,
    borderColor: "#14532D",
    borderRadius: 8,
    paddingHorizontal: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.68,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  secondaryActionButton: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderWidth: 3,
    borderColor: "#22C55E",
    borderRadius: 8,
    paddingHorizontal: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.7,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  actionIcon: {
    fontSize: 26,
    marginRight: 10,
  },
  primaryActionText: {
    flex: 1,
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
  },
  secondaryActionText: {
    flex: 1,
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  actionArrow: {
    color: "#FDE68A",
    fontSize: 30,
    fontWeight: "900",
    marginLeft: 8,
  },
  secondaryActionArrow: {
    color: "#4ADE80",
    fontSize: 30,
    fontWeight: "900",
    marginLeft: 8,
  },
  bottomNav: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    height: 62,
    backgroundColor: "rgba(4, 8, 16, 0.98)",
    borderWidth: 3,
    borderColor: "#FBBF24",
    borderRadius: 5,
    padding: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  navButton: {
    flex: 1,
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#3A4558",
    borderRadius: 3,
    paddingVertical: 4,
    marginHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  navButtonActive: {
    backgroundColor: "#162314",
    borderColor: "#FBBF24",
  },
  navText: {
    color: "#E2E8F0",
    fontSize: 17,
    fontWeight: "900",
  },
  navTextActive: {
    color: "#FDE68A",
    fontSize: 17,
    fontWeight: "900",
  },
  navLabel: {
    color: "#CBD5E1",
    fontSize: 8,
    fontWeight: "900",
    marginTop: 1,
    fontFamily: pixelFont,
  },
  navLabelActive: {
    color: "#FDE68A",
    fontSize: 8,
    fontWeight: "900",
    marginTop: 1,
    fontFamily: pixelFont,
  },
});