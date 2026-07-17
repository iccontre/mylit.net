import { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { Image, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { FormScreen } from "../components/FormScreen";
import { BottomNav } from "../components/BottomNav";
import { FeedToGuideModal } from "../components/FeedToGuideModal";
import { formPageContent } from "../constants/formStyles";
import { useMobileFrame } from "../constants/mobileLayout";
import { uiAssets } from "../constants/uiAssets";
import { loadUserLifeProfile, saveUserLifeProfile } from "../lib/mylitAgents";
import { loadLocalBetaProfile, updateProfile } from "../lib/auth";
import {
  MAX_STRONGEST_SKILL_CATEGORIES,
  SKILL_CATEGORIES,
  type FocusWindow,
  type MotivationStyle,
  type SkillCategory,
  type UserLifeProfile,
  type WorkRhythmPreference,
} from "../lib/agentTypes";

// Editable version of the UserLifeProfile the agent foundation (lib/mylitAgents.ts) already
// reads. This is entirely separate from the existing Path onboarding profile — nothing here
// touches LOCAL_PROFILE_KEY, so existing users are never routed back through onboarding, and
// an existing user who never opens this screen simply has an empty (optional) life profile.

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

const MOTIVATION_OPTIONS: { value: MotivationStyle; label: string }[] = [
  { value: "gentle", label: "Gentle" },
  { value: "direct", label: "Direct" },
  { value: "balanced", label: "Balanced" },
];

const WORK_RHYTHM_OPTIONS: { value: WorkRhythmPreference; label: string }[] = [
  { value: "spread_through_day", label: "Start early + spread tasks throughout the day" },
  { value: "focus_blocks", label: "Large focus blocks at 1–2 points in the day" },
  { value: "flexible", label: "Depends on the day" },
];

const FOCUS_WINDOW_OPTIONS: { value: FocusWindow; label: string }[] = [
  { value: "morning", label: "Morning" },
  { value: "midday", label: "Midday" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "flexible", label: "Flexible" },
];

type TextField = Exclude<
  keyof UserLifeProfile,
  | "motivationStyle"
  | "currentStage"
  | "updatedAt"
  | "workRhythmPreference"
  | "preferredFocusWindow"
  // Edited via the chip picker below, not a plain text field — see SkillCategory in agentTypes.ts.
  | "strongestSkillCategories"
  | "strongestSkillCategory"
  | "customSkillCategoryText"
>;

function normalizeDraft(profile: UserLifeProfile): Record<TextField, string> {
  return {
    futureSelfStatement: profile.futureSelfStatement ?? "",
    longTermDreamStatement: profile.longTermDreamStatement ?? "",
    careerGoals: profile.careerGoals ?? "",
    bodyHealthGoals: profile.bodyHealthGoals ?? "",
    friendshipSocialGoals: profile.friendshipSocialGoals ?? "",
    purposeGoals: profile.purposeGoals ?? "",
    confidenceGoals: profile.confidenceGoals ?? "",
    currentObstacles: profile.currentObstacles ?? "",
    preferredEvieAccountability: profile.preferredEvieAccountability ?? "",
    preferredLunaSupport: profile.preferredLunaSupport ?? "",
    commonSleepBarriers: profile.commonSleepBarriers ?? "",
    recoveryActivitiesThatHelp: profile.recoveryActivitiesThatHelp ?? "",
    plannedWakeTime: profile.plannedWakeTime ?? "",
  };
}

export default function LifeProfileScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();

  const [displayName, setDisplayName] = useState("");
  const [draft, setDraft] = useState<Record<TextField, string>>(normalizeDraft({}));
  const [motivationStyle, setMotivationStyle] = useState<MotivationStyle | "">("");
  const [workRhythmPreference, setWorkRhythmPreference] = useState<WorkRhythmPreference | "">("");
  const [preferredFocusWindow, setPreferredFocusWindow] = useState<FocusWindow | "">("");
  const [strongestSkillCategories, setStrongestSkillCategories] = useState<SkillCategory[]>([]);
  const [customSkillCategoryText, setCustomSkillCategoryText] = useState("");
  const [showFeedToEvie, setShowFeedToEvie] = useState(false);
  const [showFeedToLuna, setShowFeedToLuna] = useState(false);
  const savedSnapshotRef = useRef<string>(
    JSON.stringify({
      displayName: "",
      draft: normalizeDraft({}),
      motivationStyle: "",
      workRhythmPreference: "",
      preferredFocusWindow: "",
      strongestSkillCategories: [] as SkillCategory[],
      customSkillCategoryText: "",
    })
  );

  useEffect(() => {
    void (async () => {
      const [profile, localProfile] = await Promise.all([loadUserLifeProfile(), loadLocalBetaProfile()]);
      const nextDraft = normalizeDraft(profile);
      const nextMotivation = profile.motivationStyle ?? "";
      const nextWorkRhythm = profile.workRhythmPreference ?? "";
      const nextFocusWindow = profile.preferredFocusWindow ?? "";
      const nextDisplayName = localProfile?.display_name ?? "";
      // Migration: profiles saved before multi-select existed only have the legacy singular
      // field — treat it as the first (primary) selection rather than dropping it.
      const nextStrongestSkills =
        profile.strongestSkillCategories && profile.strongestSkillCategories.length > 0
          ? profile.strongestSkillCategories
          : profile.strongestSkillCategory
            ? [profile.strongestSkillCategory]
            : [];
      const nextCustomSkillText = profile.customSkillCategoryText ?? "";
      setDraft(nextDraft);
      setMotivationStyle(nextMotivation);
      setWorkRhythmPreference(nextWorkRhythm);
      setPreferredFocusWindow(nextFocusWindow);
      setStrongestSkillCategories(nextStrongestSkills);
      setCustomSkillCategoryText(nextCustomSkillText);
      setDisplayName(nextDisplayName);
      savedSnapshotRef.current = JSON.stringify({
        displayName: nextDisplayName,
        draft: nextDraft,
        motivationStyle: nextMotivation,
        workRhythmPreference: nextWorkRhythm,
        preferredFocusWindow: nextFocusWindow,
        strongestSkillCategories: nextStrongestSkills,
        customSkillCategoryText: nextCustomSkillText,
      });
    })();
  }, []);

  // Dirty-check against the last-saved snapshot (like Today's Quest / checklist items) rather
  // than a timed flag — fields stay populated after saving, so a timer would flip the button
  // back to "Save" a few seconds later even though nothing had changed.
  const currentSnapshot = JSON.stringify({
    displayName,
    draft,
    motivationStyle,
    workRhythmPreference,
    preferredFocusWindow,
    strongestSkillCategories,
    customSkillCategoryText,
  });
  const isDirty = currentSnapshot !== savedSnapshotRef.current;

  function updateField(field: TextField, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  function selectMotivation(value: MotivationStyle) {
    setMotivationStyle((prev) => (prev === value ? "" : value));
  }

  function selectWorkRhythm(value: WorkRhythmPreference) {
    setWorkRhythmPreference((prev) => (prev === value ? "" : value));
    if (value !== "focus_blocks") setPreferredFocusWindow("");
  }

  function selectFocusWindow(value: FocusWindow) {
    setPreferredFocusWindow((prev) => (prev === value ? "" : value));
  }

  function toggleStrongestSkillCategory(category: SkillCategory) {
    setStrongestSkillCategories((prev) => {
      if (prev.includes(category)) return prev.filter((entry) => entry !== category);
      if (prev.length >= MAX_STRONGEST_SKILL_CATEGORIES) return prev;
      return [...prev, category];
    });
  }

  async function handleSave() {
    if (!isDirty) return;
    // Explicitly include motivationStyle/workRhythmPreference/preferredFocusWindow (even as
    // undefined) so deselecting one actually clears the saved value instead of leaving the
    // old choice in place.
    const partial: Partial<UserLifeProfile> = {
      ...draft,
      motivationStyle: motivationStyle || undefined,
      workRhythmPreference: workRhythmPreference || undefined,
      preferredFocusWindow: preferredFocusWindow || undefined,
      strongestSkillCategories: strongestSkillCategories.length > 0 ? strongestSkillCategories : undefined,
      // Legacy singular field, kept as the primary (first) selection for older code that reads one.
      strongestSkillCategory: strongestSkillCategories[0] || undefined,
      customSkillCategoryText: customSkillCategoryText.trim() || undefined,
    };
    await saveUserLifeProfile(partial);
    // display_name lives in the existing onboarding profile system (LOCAL_PROFILE_KEY), not
    // UserLifeProfile — updateProfile() already handles local+cloud sync for it safely.
    const trimmedName = displayName.trim();
    if (trimmedName) {
      await updateProfile({ display_name: trimmedName });
    }
    savedSnapshotRef.current = currentSnapshot;
  }

  const saveLabel = isDirty ? "SAVE LIFE PROFILE" : "SAVED";

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={uiAssets.backgrounds.neutral} style={styles.backgroundImage} resizeMode="cover" />
        </View>
        <View style={styles.worldOverlay}>
          <FormScreen scrollPaddingBottom={mobile.formScrollPaddingBottom} contentContainerStyle={[formPageContent, styles.hudContent]}>
            <View style={styles.hero}>
              <Text style={styles.heroKicker}>GUIDE MEMORY</Text>
              <Text style={styles.title}>LIFE PROFILE</Text>
              <Text style={styles.subtitle}>Optional. Everything here helps Evie and Luna understand you — nothing here is required to use MYLIT.</Text>
            </View>

            <View style={styles.guideRow}>
              <Image source={uiAssets.guides.evie} style={styles.guideAvatar} resizeMode="contain" />
              <Text style={styles.guideText}>
                Your path is starting to form. I&apos;ll use your goals, obstacles, and progress patterns to help you build forward.
              </Text>
            </View>

            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>DISPLAY NAME</Text>
              <TextInput
                style={styles.textArea}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="What should MYLIT call you?"
                placeholderTextColor="#94A3B8"
              />
            </View>

            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>MOTIVATION STYLE</Text>
              <Text style={styles.helperText}>How should MYLIT talk to you when things get hard?</Text>
              <View style={styles.choiceRow}>
                {MOTIVATION_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.choiceButton, motivationStyle === option.value && styles.choiceButtonActive]}
                    onPress={() => selectMotivation(option.value)}
                  >
                    <Text style={[styles.choiceText, motivationStyle === option.value && styles.choiceTextActive]}>{option.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>HOW YOU WORK</Text>
              <Text style={styles.helperText}>
                Do you prefer to start early and work on tasks throughout the day, or finish your major tasks in larger focus blocks?
              </Text>
              <View style={styles.choiceColumn}>
                {WORK_RHYTHM_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.choiceButtonWide, workRhythmPreference === option.value && styles.choiceButtonActive]}
                    onPress={() => selectWorkRhythm(option.value)}
                  >
                    <Text style={[styles.choiceText, workRhythmPreference === option.value && styles.choiceTextActive]}>{option.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {workRhythmPreference === "focus_blocks" ? (
                <>
                  <Text style={styles.label}>Preferred focus window</Text>
                  <View style={styles.choiceRow}>
                    {FOCUS_WINDOW_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[styles.choiceButton, preferredFocusWindow === option.value && styles.choiceButtonActive]}
                        onPress={() => selectFocusWindow(option.value)}
                      >
                        <Text style={[styles.choiceText, preferredFocusWindow === option.value && styles.choiceTextActive]}>{option.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : null}

              <Text style={styles.label}>Planned wake time (optional)</Text>
              <TextInput
                style={styles.textInputSmall}
                placeholder="e.g. 7:00 AM"
                placeholderTextColor="#94A3B8"
                value={draft.plannedWakeTime}
                onChangeText={(text) => updateField("plannedWakeTime", text)}
              />
            </View>

            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>STRONGEST AREAS</Text>
              <Text style={styles.helperText}>Choose up to {MAX_STRONGEST_SKILL_CATEGORIES} areas that feel strongest for you right now.</Text>
              <Text style={styles.helperText}>Start with what already feels natural. Evie can help you expand from there.</Text>
              <Text style={styles.helperText}>Luna can support the parts that feel harder.</Text>
              <Text style={styles.skillCountLabel}>{strongestSkillCategories.length} / {MAX_STRONGEST_SKILL_CATEGORIES} selected</Text>
              <View style={styles.choiceRow}>
                {SKILL_CATEGORIES.map((category) => {
                  const selected = strongestSkillCategories.includes(category);
                  const atLimit = !selected && strongestSkillCategories.length >= MAX_STRONGEST_SKILL_CATEGORIES;
                  return (
                    <TouchableOpacity
                      key={category}
                      style={[styles.choiceButton, selected && styles.choiceButtonActive, atLimit && styles.choiceButtonDisabled]}
                      disabled={atLimit}
                      onPress={() => toggleStrongestSkillCategory(category)}
                    >
                      <Text style={[styles.choiceText, selected && styles.choiceTextActive]}>{category}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {strongestSkillCategories.includes("Custom") ? (
                <TextInput
                  style={styles.textInputSmall}
                  placeholder="Name your own area"
                  placeholderTextColor="#94A3B8"
                  value={customSkillCategoryText}
                  onChangeText={setCustomSkillCategoryText}
                />
              ) : null}
            </View>

            <View style={[styles.panel, styles.evieAccent]}>
              <Text style={[styles.sectionTitle, styles.evieTitle]}>EVIE — YOUR PATH</Text>

              <Text style={styles.label}>Future self statement</Text>
              <TextInput
                style={styles.textArea}
                multiline
                placeholder="Who are you becoming?"
                placeholderTextColor="#94A3B8"
                value={draft.futureSelfStatement}
                onChangeText={(text) => updateField("futureSelfStatement", text)}
              />

              <Text style={styles.label}>Long-term dream</Text>
              <TextInput
                style={styles.textArea}
                multiline
                placeholder="The bigger dream underneath the daily goals."
                placeholderTextColor="#94A3B8"
                value={draft.longTermDreamStatement}
                onChangeText={(text) => updateField("longTermDreamStatement", text)}
              />

              <Text style={styles.label}>Career or path goals</Text>
              <TextInput
                style={styles.textArea}
                multiline
                placeholder="What you want to build professionally."
                placeholderTextColor="#94A3B8"
                value={draft.careerGoals}
                onChangeText={(text) => updateField("careerGoals", text)}
              />

              <Text style={styles.label}>Body / health goals</Text>
              <TextInput
                style={styles.textArea}
                multiline
                placeholder="How you want to feel in your body."
                placeholderTextColor="#94A3B8"
                value={draft.bodyHealthGoals}
                onChangeText={(text) => updateField("bodyHealthGoals", text)}
              />

              <Text style={styles.label}>Friendship / social goals</Text>
              <TextInput
                style={styles.textArea}
                multiline
                placeholder="The relationships you want to build or repair."
                placeholderTextColor="#94A3B8"
                value={draft.friendshipSocialGoals}
                onChangeText={(text) => updateField("friendshipSocialGoals", text)}
              />

              <Text style={styles.label}>Purpose goals</Text>
              <TextInput
                style={styles.textArea}
                multiline
                placeholder="What makes your time feel worth it."
                placeholderTextColor="#94A3B8"
                value={draft.purposeGoals}
                onChangeText={(text) => updateField("purposeGoals", text)}
              />

              <Text style={styles.label}>Confidence goals</Text>
              <TextInput
                style={styles.textArea}
                multiline
                placeholder="Where you want to trust yourself more."
                placeholderTextColor="#94A3B8"
                value={draft.confidenceGoals}
                onChangeText={(text) => updateField("confidenceGoals", text)}
              />

              <Text style={styles.label}>Current obstacles</Text>
              <TextInput
                style={styles.textArea}
                multiline
                placeholder="What's actually in the way right now."
                placeholderTextColor="#94A3B8"
                value={draft.currentObstacles}
                onChangeText={(text) => updateField("currentObstacles", text)}
              />

              <Text style={styles.label}>How Evie should hold you accountable</Text>
              <TextInput
                style={styles.textArea}
                multiline
                placeholder="Push me / check in daily / remind me why this matters, etc."
                placeholderTextColor="#94A3B8"
                value={draft.preferredEvieAccountability}
                onChangeText={(text) => updateField("preferredEvieAccountability", text)}
              />

              <TouchableOpacity style={styles.feedToEvieBtn} onPress={() => setShowFeedToEvie(true)}>
                <Image source={uiAssets.guides.evie} style={styles.feedToGuideAvatar} resizeMode="contain" />
                <Text style={styles.feedToEvieBtnText}>Feed my goals to Evie</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.panel, styles.lunaAccent]}>
              <Text style={[styles.sectionTitle, styles.lunaTitle]}>LUNA — YOUR RECOVERY</Text>

              <Text style={styles.label}>Common sleep barriers</Text>
              <TextInput
                style={styles.textArea}
                multiline
                placeholder="What tends to get in the way of good sleep."
                placeholderTextColor="#94A3B8"
                value={draft.commonSleepBarriers}
                onChangeText={(text) => updateField("commonSleepBarriers", text)}
              />

              <Text style={styles.label}>Recovery activities that help</Text>
              <TextInput
                style={styles.textArea}
                multiline
                placeholder="What actually restores you."
                placeholderTextColor="#94A3B8"
                value={draft.recoveryActivitiesThatHelp}
                onChangeText={(text) => updateField("recoveryActivitiesThatHelp", text)}
              />

              <Text style={styles.label}>How Luna should support you</Text>
              <TextInput
                style={styles.textArea}
                multiline
                placeholder="Gently check in / give me space / remind me recovery counts, etc."
                placeholderTextColor="#94A3B8"
                value={draft.preferredLunaSupport}
                onChangeText={(text) => updateField("preferredLunaSupport", text)}
              />

              <TouchableOpacity style={styles.feedToLunaBtn} onPress={() => setShowFeedToLuna(true)}>
                <Image source={uiAssets.guides.luna} style={styles.feedToGuideAvatar} resizeMode="contain" />
                <Text style={styles.feedToLunaBtnText}>Feed my recovery notes to Luna</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[styles.saveButton, !isDirty && styles.saveButtonDisabled]} disabled={!isDirty} onPress={handleSave}>
              <Text style={styles.saveButtonText}>{saveLabel}</Text>
            </TouchableOpacity>

            <FeedToGuideModal
              visible={showFeedToEvie}
              guide="evie"
              sourceType="pathGoal"
              sourceId="life-profile-goals"
              sourceText={[
                draft.futureSelfStatement,
                draft.longTermDreamStatement,
                draft.careerGoals,
                draft.bodyHealthGoals,
                draft.friendshipSocialGoals,
                draft.purposeGoals,
                draft.confidenceGoals,
                draft.currentObstacles,
                draft.preferredEvieAccountability,
              ].filter(Boolean).join("\n\n")}
              onClose={() => setShowFeedToEvie(false)}
            />
            <FeedToGuideModal
              visible={showFeedToLuna}
              guide="luna"
              sourceType="lifeProfile"
              sourceId="life-profile-recovery"
              sourceText={[draft.commonSleepBarriers, draft.recoveryActivitiesThatHelp, draft.preferredLunaSupport].filter(Boolean).join("\n\n")}
              onClose={() => setShowFeedToLuna(false)}
            />

            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
          </FormScreen>

          <BottomNav activeRoute="path" bottomOffset={mobile.bottomNavOffset} />
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
  worldOverlay: { flex: 1, backgroundColor: "rgba(4, 8, 14, 0.4)" },
  hudContent: { paddingTop: 8 },
  hero: {
    backgroundColor: "rgba(46,32,20, 0.95)",
    borderWidth: 3,
    borderColor: "#D99B2B",
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  heroKicker: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 1.5, textAlign: "center", marginBottom: 6 },
  title: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 26, fontWeight: "900", letterSpacing: 1, textAlign: "center", marginBottom: 8 },
  subtitle: { color: "#CBD5E1", fontSize: 12, lineHeight: 17, fontWeight: "700", textAlign: "center" },
  guideRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(46,32,20, 0.95)",
    borderWidth: 2,
    borderColor: "#5C4425",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  guideAvatar: { width: 44, height: 44, marginRight: 10 },
  guideText: { flex: 1, color: "#E2E8F0", fontSize: 12, lineHeight: 17, fontWeight: "700" },
  panel: {
    backgroundColor: "rgba(46,32,20, 0.95)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: "#5C4425",
  },
  evieAccent: { borderColor: "#FBBF24" },
  lunaAccent: { borderColor: "#A78BFA" },
  feedToGuideAvatar: { width: 20, height: 20, borderRadius: 10 },
  feedToEvieBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 2,
    borderColor: "#92610A",
    borderRadius: 6,
    paddingVertical: 10,
    backgroundColor: "rgba(146, 97, 10, 0.25)",
  },
  feedToEvieBtnText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  feedToLunaBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 3,
    borderColor: "#4C1D95",
    borderRadius: 6,
    paddingVertical: 10,
    backgroundColor: "#7C3AED",
  },
  feedToLunaBtnText: { color: "#FFFFFF", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
  sectionTitle: { color: "#FDE047", fontFamily: pixelFont, fontSize: 14, fontWeight: "900", letterSpacing: 0.5, textAlign: "center", marginBottom: 8 },
  evieTitle: { color: "#FDE68A" },
  lunaTitle: { color: "#E9D5FF" },
  helperText: { color: "#94A3B8", fontSize: 11, lineHeight: 16, fontWeight: "700", textAlign: "center", marginBottom: 10 },
  choiceRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  choiceColumn: { gap: 8 },
  choiceButton: { flex: 1, borderWidth: 2, borderColor: "#475569", borderRadius: 6, paddingVertical: 10, alignItems: "center", backgroundColor: "rgba(46,32,20,0.9)", minWidth: 90 },
  choiceButtonWide: { borderWidth: 2, borderColor: "#475569", borderRadius: 6, paddingVertical: 10, paddingHorizontal: 10, alignItems: "center", backgroundColor: "rgba(46,32,20,0.9)" },
  choiceButtonActive: { borderColor: "#FBBF24", backgroundColor: "rgba(69,43,8,0.7)" },
  choiceButtonDisabled: { opacity: 0.4 },
  choiceText: { color: "#CBD5E1", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", textAlign: "center" },
  choiceTextActive: { color: "#FDE68A" },
  skillCountLabel: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", textAlign: "center", marginBottom: 8 },
  textInputSmall: {
    backgroundColor: "#F4E8CE",
    borderWidth: 2,
    borderColor: "#5C4425",
    borderRadius: 7,
    color: "#4A3620",
    fontSize: 14,
    fontWeight: "700",
    padding: 10,
  },
  label: { color: "#CBD5E1", fontSize: 11, fontWeight: "800", marginBottom: 5, marginTop: 10 },
  textArea: {
    backgroundColor: "#F4E8CE",
    borderWidth: 2,
    borderColor: "#5C4425",
    borderRadius: 7,
    color: "#4A3620",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
    minHeight: 56,
    maxHeight: 130,
    padding: 10,
    textAlignVertical: "top",
  },
  saveButton: {
    backgroundColor: "#166534",
    borderWidth: 2,
    borderColor: "#22C55E",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  saveButtonDisabled: { backgroundColor: "rgba(22,101,52,0.4)", borderColor: "#5C4425" },
  saveButtonText: { color: "#F0FDF4", fontFamily: pixelFont, fontSize: 13, fontWeight: "900", letterSpacing: 0.8 },
  backButton: { alignItems: "center", paddingVertical: 12, marginBottom: 90 },
  backButtonText: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 12, fontWeight: "900" },
});
