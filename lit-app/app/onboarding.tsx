import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { FormScreen } from "../components/FormScreen";
import { formPageContent } from "../constants/formStyles";
import {
  GOAL_HORIZON_LABELS,
  type GoalHorizon,
  type GoalMilestoneSet,
} from "../constants/goalMilestoneTemplates";
import { useMobileFrame } from "../constants/mobileLayout";
import { uiAssets } from "../constants/uiAssets";
import { LOCAL_PROFILE_KEY, getOrCreateProfile, updateProfile } from "../lib/auth";
import { persistProgressKeys } from "../lib/progressStore";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";
import { isSupabaseConfigured } from "../lib/supabase";
import { logGoalFeedback } from "../lib/feedbackLog";
import {
  generateFromDatabase,
  variantCountFor,
  type GenerationSource,
} from "../lib/goalGeneration";

type DreamCategory = "Health" | "School / Work" | "Social Life" | "Purpose";

type UserProfile = {
  name: string;
  longTermDream: string;
  dreamCategory: DreamCategory | "";
  /** Optional second path — smaller day-to-day goals in a category besides your Main Path. */
  supplementaryCategory?: DreamCategory | "";
  progressMeaning: string;
  // Phase 1 tiered goals
  specificGoal: string;
  shortTermGoal: string;
  midTermGoal: string;
  longTermGoal: string;
  goalsGeneratedAt?: string;
  onboardingComplete?: boolean;
  goalsSource?: GenerationSource;
  // Legacy mirrored fields, kept so older screens continue to read goals
  goalOne: string;
  goalTwo: string;
  goalThree: string;
  biggestObstacle: string;
  hasWorkOrSchool: boolean;
  hasTransportation: boolean;
  hasGymAccess: boolean;
  hasQuietSpace: boolean;
  hasFoodControl: boolean;
};

const PROFILE_KEY = LOCAL_PROFILE_KEY;
const pathBackground = require("../assets/ui/backgrounds/path-background.png");

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

const readableFont = Platform.select({
  ios: "Arial",
  android: "sans-serif",
  web: "Arial",
  default: undefined,
});

const CATEGORY_MEANINGS: Record<DreamCategory, string> = {
  Health: "fitness, sleep, energy, body, wellness",
  "School / Work": "homework, studying, coding, career, productivity",
  "Social Life": "friends, confidence, meeting new people, connection",
  Purpose: "direction, identity, creativity, growth, meaning",
};

const CATEGORY_ICONS: Record<DreamCategory, string> = {
  Health: "❤",
  "School / Work": "📘",
  "Social Life": "👥",
  Purpose: "✦",
};

const DREAM_CATEGORIES = Object.keys(CATEGORY_MEANINGS) as DreamCategory[];

const MILESTONE_META: Record<GoalHorizon, { icon: string; title: string; tone: string }> = {
  shortTerm: { icon: "🪧", title: "SHORT-TERM", tone: "#0F7A3A" },
  midTerm: { icon: "🚩", title: "MID-TERM", tone: "#155E9F" },
  longTerm: { icon: "🏆", title: "LONG-TERM", tone: "#7C2D69" },
};

const EMPTY_MILESTONES: GoalMilestoneSet = {
  shortTerm: "",
  midTerm: "",
  longTerm: "",
};

const CATEGORY_SET = new Set<string>(DREAM_CATEGORIES);

/** Map onboarding categories to goal-database keys (main simplified Social Life). */
const LEGACY_CATEGORY_ALIASES: Record<string, DreamCategory> = {
  "Friends / Connection": "Social Life",
  Money: "Purpose",
  Mind: "Purpose",
  Confidence: "Social Life",
  Creativity: "Purpose",
  Sleep: "Health",
  "Phone Use": "Purpose",
};

function normalizeDreamCategory(category?: string): DreamCategory | "" {
  if (!category) return "";
  if (CATEGORY_SET.has(category)) return category as DreamCategory;
  return LEGACY_CATEGORY_ALIASES[category] ?? "";
}

function databaseCategoryFor(category: DreamCategory): string {
  return category === "Social Life" ? "Friends / Connection" : category;
}
function ToggleButton({
  label,
  value,
  onPress,
}: {
  label: string;
  value: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.toggleButton, value && styles.activeToggleButton]} onPress={onPress}>
      <Text style={[styles.toggleText, value && styles.activeToggleText]}>
        {value ? "✓" : "□"} {label}
      </Text>
    </TouchableOpacity>
  );
}

function NumberBadge({ value }: { value: string }) {
  return (
    <View style={styles.numberBadge}>
      <Text style={styles.numberBadgeText}>{value}</Text>
    </View>
  );
}

function SectionShell({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.sectionRow}>
      <NumberBadge value={number} />
      <View style={styles.sectionPanel}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

const MILESTONE_PLACEHOLDERS: Record<GoalHorizon, string> = {
  shortTerm: "Ex: Sleep by 11 twice this week",
  midTerm: "Ex: Build a steady study routine",
  longTerm: "Ex: Feel ready for next quarter",
};

function MilestoneField({
  horizon,
  value,
  onChange,
}: {
  horizon: GoalHorizon;
  value: string;
  onChange: (next: string) => void;
}) {
  const cardMeta = MILESTONE_META[horizon];

  return (
    <View style={styles.milestoneCard}>
      <View style={[styles.milestoneBanner, { backgroundColor: cardMeta.tone }]}>
        <Text style={styles.milestoneBannerText}>{cardMeta.title}</Text>
      </View>
      <Text style={styles.milestoneCaption}>{GOAL_HORIZON_LABELS[horizon].caption}</Text>
      <TextInput
        style={styles.milestoneInput}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
        placeholder={MILESTONE_PLACEHOLDERS[horizon]}
        placeholderTextColor="#8A5D2B"
        value={value}
        onChangeText={onChange}
        scrollEnabled={false}
      />
    </View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isEditPath = mode === "editPath";
  const mobile = useMobileFrame();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const modalWidth = Math.min(screenWidth - 32, 480);
  const modalMaxHeight = Math.min(screenHeight * 0.78, 620);

  const [name, setName] = useState("");
  const [longTermDream, setLongTermDream] = useState("");
  const [dreamCategory, setDreamCategory] = useState<DreamCategory | "">("");
  const [supplementaryCategory, setSupplementaryCategory] = useState<DreamCategory | "">("");
  const [progressMeaning, setProgressMeaning] = useState("");
  const [specificGoal, setSpecificGoal] = useState("");
  const [shortTermGoal, setShortTermGoal] = useState("");
  const [midTermGoal, setMidTermGoal] = useState("");
  const [longTermGoal, setLongTermGoal] = useState("");
  const [lastGenerated, setLastGenerated] = useState<GoalMilestoneSet>(EMPTY_MILESTONES);
  const [generationSource, setGenerationSource] = useState<GenerationSource>("database");
  const [hasGenerated, setHasGenerated] = useState(false);
  const [variantIndex, setVariantIndex] = useState(0);
  const [biggestObstacle, setBiggestObstacle] = useState("");
  const [hasWorkOrSchool, setHasWorkOrSchool] = useState(true);
  const [hasTransportation, setHasTransportation] = useState(false);
  const [hasGymAccess, setHasGymAccess] = useState(false);
  const [hasQuietSpace, setHasQuietSpace] = useState(false);
  const [hasFoodControl, setHasFoodControl] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const milestonesEmpty = useMemo(
    () => !shortTermGoal.trim() && !midTermGoal.trim() && !longTermGoal.trim(),
    [shortTermGoal, midTermGoal, longTermGoal]
  );

  function applyMilestones(next: GoalMilestoneSet) {
    setShortTermGoal(next.shortTerm);
    setMidTermGoal(next.midTerm);
    setLongTermGoal(next.longTerm);
  }

  /**
   * Offline generation: pull a milestone variant for the chosen category from
   * the bundled database and slot in the user's specific goal. Instant, no
   * network. `cycle` advances to the next authored variant so the user can
   * regenerate for a different draft.
   */
  function generateMilestones(cycle = false) {
    if (!dreamCategory) {
      setValidationMessage("Pick a category first if you want goal suggestions.");
      return;
    }
    setValidationMessage("");

    const nextIndex = cycle && hasGenerated ? variantIndex + 1 : variantIndex;
    const result = generateFromDatabase(
      { category: databaseCategoryFor(dreamCategory), specificGoal },
      nextIndex
    );

    const set: GoalMilestoneSet = {
      shortTerm: result.shortTerm,
      midTerm: result.midTerm,
      longTerm: result.longTerm,
    };

    applyMilestones(set);
    setLastGenerated(set);
    setGenerationSource(result.source);
    setVariantIndex(nextIndex);
    setHasGenerated(true);
  }

  function applyCategory(category: DreamCategory) {
    // Selecting a category no longer auto-generates — the user clicks Generate.
    setDreamCategory(category);
    setVariantIndex(0);
    setHasGenerated(false);
    // Main and Supplementary can't be the same category.
    if (supplementaryCategory === category) setSupplementaryCategory("");
  }

  function applySupplementaryCategory(category: DreamCategory | "") {
    setSupplementaryCategory((current) => (current === category ? "" : category));
  }

  async function loadProfile() {
    const saved = await AsyncStorage.getItem(PROFILE_KEY);

    if (saved) {
      try {
        const profile = JSON.parse(saved) as Partial<UserProfile>;
        const savedCategory = normalizeDreamCategory(profile.dreamCategory);

        setName(profile.name || "");
        setLongTermDream(profile.longTermDream || "");
        setDreamCategory(savedCategory);
        const savedSupplementary = normalizeDreamCategory(profile.supplementaryCategory);
        setSupplementaryCategory(savedSupplementary === savedCategory ? "" : savedSupplementary);
        setProgressMeaning(profile.progressMeaning || "");
        setSpecificGoal(profile.specificGoal || "");

        const loadedShort = profile.shortTermGoal || profile.goalOne || "";
        const loadedMid = profile.midTermGoal || profile.goalTwo || "";
        const loadedLong = profile.longTermGoal || profile.goalThree || "";
        setShortTermGoal(loadedShort);
        setMidTermGoal(loadedMid);
        setLongTermGoal(loadedLong);
        if (loadedShort || loadedMid || loadedLong) {
          setHasGenerated(true);
          setLastGenerated({ shortTerm: loadedShort, midTerm: loadedMid, longTerm: loadedLong });
        }
        if (profile.goalsSource) setGenerationSource(profile.goalsSource);

        setBiggestObstacle(profile.biggestObstacle || "");
        setHasWorkOrSchool(profile.hasWorkOrSchool ?? true);
        setHasTransportation(profile.hasTransportation ?? false);
        setHasGymAccess(profile.hasGymAccess ?? false);
        setHasQuietSpace(profile.hasQuietSpace ?? false);
        setHasFoodControl(profile.hasFoodControl ?? false);
      } catch {
        // Keep defaults on parse failure
      }
    }

    const betaProfile = await getOrCreateProfile();
    if (betaProfile?.display_name) {
      setName((current) => current || betaProfile.display_name || "");
    }
  }

  async function saveProfile() {
    const trimmedName = name.trim();
    // longTermDream is no longer collected here; preserve whatever was set
    // elsewhere (e.g. the "Next Long-Term Goal" flow) so we don't wipe it.
    const trimmedDream = longTermDream.trim();

    if (!trimmedName || !dreamCategory) {
      setValidationMessage("Please add your name and pick a category.");
      return;
    }

    if (milestonesEmpty) {
      setValidationMessage("Write at least one milestone goal in the fields below.");
      return;
    }

    setValidationMessage("");

    const existingRaw = await AsyncStorage.getItem(PROFILE_KEY);
    let existingProfile: Partial<UserProfile> | null = null;
    if (existingRaw) {
      try {
        existingProfile = JSON.parse(existingRaw) as Partial<UserProfile>;
      } catch {
        existingProfile = null;
      }
    }

    const isPathUpdate =
      Boolean(existingProfile?.onboardingComplete) || Boolean(existingProfile?.goalsGeneratedAt);

    const finalMilestones: GoalMilestoneSet = {
      shortTerm: shortTermGoal.trim(),
      midTerm: midTermGoal.trim(),
      longTerm: longTermGoal.trim(),
    };

    const profile: UserProfile = {
      name: trimmedName,
      longTermDream: trimmedDream,
      dreamCategory,
      supplementaryCategory: supplementaryCategory || "",
      progressMeaning: progressMeaning.trim(),
      specificGoal: specificGoal.trim(),
      shortTermGoal: finalMilestones.shortTerm,
      midTermGoal: finalMilestones.midTerm,
      longTermGoal: finalMilestones.longTerm,
      goalsGeneratedAt: isPathUpdate
        ? existingProfile?.goalsGeneratedAt || new Date().toISOString()
        : new Date().toISOString(),
      onboardingComplete: true,
      goalsSource: generationSource,
      // Mirror tiered goals back into legacy fields so older screens keep working.
      goalOne: finalMilestones.shortTerm,
      goalTwo: finalMilestones.midTerm,
      goalThree: finalMilestones.longTerm,
      biggestObstacle: biggestObstacle.trim(),
      hasWorkOrSchool,
      hasTransportation,
      hasGymAccess,
      hasQuietSpace,
      hasFoodControl,
    };

    await persistProgressKeys({ [PROFILE_KEY]: JSON.stringify(profile) });

    if (isSupabaseConfigured()) {
      await updateProfile({
        display_name: trimmedName,
        onboarding_complete: true,
      });
    }

    void trackEvent(ANALYTICS_EVENTS.onboarding_completed, { category: dreamCategory });

    // Record the (generated, final) pair so we can learn from user edits.
    // Failures here are intentionally swallowed inside logGoalFeedback.
    void logGoalFeedback({
      category: dreamCategory,
      dream: trimmedDream,
      specificGoal: specificGoal.trim(),
      mode: null,
      generated: lastGenerated,
      final: finalMilestones,
    });

    router.replace(isEditPath ? "/path" : "/(tabs)");
  }

  const canRegenerate =
    dreamCategory !== "" && hasGenerated && variantCountFor(databaseCategoryFor(dreamCategory)) > 1;

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <Modal
        visible={showInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInfo(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { width: modalWidth, maxHeight: modalMaxHeight }]}>
            <View style={styles.modalHeader}>
              <Image source={uiAssets.guides.evie} style={styles.modalAvatar} resizeMode="contain" />
              <View style={{ flex: 1 }}>
                <Text style={styles.modalGuideName}>Evie</Text>
                <Text style={styles.modalTitle}>How Set My Path Works</Text>
              </View>
            </View>
            <View style={styles.modalDivider} />
            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
              {[
                "Set My Path creates your starting direction.",
                "Path sets where MYLIT should focus — it does not reset your progress.",
                "Short-term = around 2 weeks. Mid-term = around 1 month. Long-term = around 3 months.",
                "Your category and resources shape future quests and checklist habits.",
                "Supplementary Path is optional — a second category for smaller day-to-day goals alongside your Main Path.",
                "Resources help MYLIT suggest realistic habits.",
                "Obstacles help MYLIT avoid quests that ignore your real life.",
                "Updating your path later is safe — your steps and history stay.",
              ].map((bullet, i) => (
                <View key={i} style={styles.modalBulletRow}>
                  <Text style={styles.modalBullet}>›</Text>
                  <Text style={styles.modalBulletText}>{bullet}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowInfo(false)}>
              <Text style={styles.modalCloseBtnText}>RETURN</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={pathBackground} style={styles.backgroundImage} resizeMode="stretch" />
        </View>
        <View style={styles.pageContainer}>
        <FormScreen scrollPaddingBottom={mobile.formScrollPaddingBottom} contentContainerStyle={[formPageContent, styles.boardContent]}>
          <Image source={uiAssets.logo.mylit} style={styles.logo} resizeMode="contain" />

          <View style={styles.bannerPanel}>
            <Text style={styles.bannerTitle}>✦ SET MY PATH ✦</Text>
            <Text style={styles.bannerSubtitle}>Map your dream. Turn it into clear milestones.</Text>
          </View>

          <View style={styles.eviePanel}>
            <Image source={uiAssets.guides.evie} style={styles.evieImage} resizeMode="contain" />
            <Text style={styles.evieText}>
              <Text style={styles.evieName}>Evie</Text> — Set your path once, then adjust it whenever life changes. I’ll use this to shape quests and checklist habits that fit your real life.
            </Text>
            <TouchableOpacity style={styles.infoBtn} onPress={() => setShowInfo(true)}>
              <Text style={styles.infoBtnText}>?</Text>
            </TouchableOpacity>
          </View>

          <SectionShell number="1" title="ENTER YOUR NAME">
            <TextInput
              style={styles.input}
              placeholder="Example: Isaac"
              placeholderTextColor="#8A5D2B"
              value={name}
              onChangeText={setName}
            />
          </SectionShell>

          <SectionShell number="2" title="CHOOSE YOUR CATEGORY">
            <View style={styles.categoryGrid}>
              {DREAM_CATEGORIES.map((category) => {
                const selected = dreamCategory === category;
                return (
                  <TouchableOpacity
                    key={category}
                    style={[styles.categoryButton, selected && styles.categoryButtonActive]}
                    onPress={() => applyCategory(category)}
                  >
                    <Text style={styles.categoryIcon}>{CATEGORY_ICONS[category]}</Text>
                    <View style={styles.categoryCopy}>
                      <Text style={[styles.categoryText, selected && styles.categoryTextActive]}>
                        {category}
                      </Text>
                      <Text style={[styles.categoryMeaningText, selected && styles.categoryMeaningTextActive]}>
                        {CATEGORY_MEANINGS[category]}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </SectionShell>

          <SectionShell number="3" title="SUPPLEMENTARY PATH (OPTIONAL)">
            <Text style={styles.helperText}>
              Your Main Path drives most quests and app suggestions. Add a Supplementary Path for a second area — MYLIT will
              still occasionally suggest small quests to help you hit those smaller goals too.
            </Text>
            <View style={styles.categoryGrid}>
              {DREAM_CATEGORIES.filter((category) => category !== dreamCategory).map((category) => {
                const selected = supplementaryCategory === category;
                return (
                  <TouchableOpacity
                    key={category}
                    style={[styles.categoryButton, selected && styles.categoryButtonActive]}
                    onPress={() => applySupplementaryCategory(category)}
                  >
                    <Text style={styles.categoryIcon}>{CATEGORY_ICONS[category]}</Text>
                    <View style={styles.categoryCopy}>
                      <Text style={[styles.categoryText, selected && styles.categoryTextActive]}>
                        {category}
                      </Text>
                      <Text style={[styles.categoryMeaningText, selected && styles.categoryMeaningTextActive]}>
                        {CATEGORY_MEANINGS[category]}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            {supplementaryCategory ? (
              <TouchableOpacity style={styles.clearSupplementaryBtn} onPress={() => setSupplementaryCategory("")}>
                <Text style={styles.clearSupplementaryText}>✕ Clear Supplementary Path</Text>
              </TouchableOpacity>
            ) : null}
          </SectionShell>

          <SectionShell number="4" title="WHAT IS YOUR SPECIFIC GOAL?">
            <TextInput
              style={styles.input}
              placeholder="Example: lose 15 lbs"
              placeholderTextColor="#8A5D2B"
              value={specificGoal}
              onChangeText={setSpecificGoal}
            />
            <Text style={styles.helperText}>Be specific.</Text>
          </SectionShell>

          <SectionShell number="5" title="YOUR PATH MILESTONES">
            <Text style={styles.milestoneHint}>
              Write your own short-, mid-, and long-term goals below. In beta, your words matter most.
            </Text>
            <Text style={styles.betaNoteText}>
              Optional: tap Suggest goals for a starting draft you can edit.
            </Text>

            <View style={styles.milestoneGrid}>
              <MilestoneField horizon="shortTerm" value={shortTermGoal} onChange={setShortTermGoal} />
              <MilestoneField horizon="midTerm" value={midTermGoal} onChange={setMidTermGoal} />
              <MilestoneField horizon="longTerm" value={longTermGoal} onChange={setLongTermGoal} />
            </View>

            <TouchableOpacity
              style={[styles.generateButtonSecondary, !dreamCategory && styles.generateButtonDisabled]}
              onPress={() => generateMilestones(Boolean(canRegenerate))}
              disabled={!dreamCategory}
            >
              <Text style={styles.generateButtonSecondaryText}>
                {hasGenerated ? "NEW SUGGESTION" : "SUGGEST GOALS (BETA)"}
              </Text>
            </TouchableOpacity>
          </SectionShell>

          <SectionShell number="6" title="WHAT DOES PROGRESS MEAN?">
            <TextInput
              style={styles.input}
              placeholder="Example: working on my app at least 1 hour a day"
              placeholderTextColor="#8A5D2B"
              value={progressMeaning}
              onChangeText={setProgressMeaning}
            />
            <Text style={styles.helperText}>How will you know you’re moving forward?</Text>
          </SectionShell>

          <SectionShell number="7" title="YOUR RESOURCES">
            <View style={styles.resourceList}>
              <ToggleButton
                label="I have work or school responsibilities"
                value={hasWorkOrSchool}
                onPress={() => setHasWorkOrSchool(!hasWorkOrSchool)}
              />
              <ToggleButton
                label="I usually have transportation"
                value={hasTransportation}
                onPress={() => setHasTransportation(!hasTransportation)}
              />
              <ToggleButton
                label="I have gym access"
                value={hasGymAccess}
                onPress={() => setHasGymAccess(!hasGymAccess)}
              />
              <ToggleButton
                label="I have a quiet study/work space"
                value={hasQuietSpace}
                onPress={() => setHasQuietSpace(!hasQuietSpace)}
              />
              <ToggleButton
                label="I have control over food/meals"
                value={hasFoodControl}
                onPress={() => setHasFoodControl(!hasFoodControl)}
              />
            </View>
          </SectionShell>

          <SectionShell number="8" title="WHAT IS GETTING IN YOUR WAY RIGHT NOW?">
            <TextInput
              style={[styles.input, styles.obstacleInput]}
              placeholder="Example: distractions, low energy, time, stress"
              placeholderTextColor="#8A5D2B"
              value={biggestObstacle}
              onChangeText={setBiggestObstacle}
            />
            <Text style={styles.helperText}>Name the obstacle so your path can work around it.</Text>
          </SectionShell>

          {validationMessage ? <Text style={styles.validationText}>{validationMessage}</Text> : null}

          <TouchableOpacity style={styles.saveButton} onPress={saveProfile}>
            <Text style={styles.saveButtonText}>{isEditPath ? "UPDATE MY PATH" : "SAVE MY PATH"}</Text>
          </TouchableOpacity>
        </FormScreen>

        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: {
    flex: 1,
    backgroundColor: "#0E0703",
  },
  phoneStage: {
    alignSelf: "center",
    backgroundColor: "#2A1608",
    overflow: "hidden",
    position: "relative",
  },
  phoneStageFullscreen: {
    borderWidth: 0,
    maxWidth: undefined,
    aspectRatio: undefined,
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
  screenScroller: {
    flex: 1,
    zIndex: 1,
  },
  boardContent: {
    paddingTop: 12,
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  logo: {
    width: "68%",
    height: 58,
    alignSelf: "center",
    marginBottom: -2,
  },
  bannerPanel: {
    backgroundColor: "rgba(245, 205, 125, 0.86)",
    borderWidth: 2,
    borderColor: "#4B2A0B",
    borderRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginBottom: 6,
    alignItems: "center",
    shadowColor: "#2B1403",
    shadowOpacity: 0.55,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 },
  },
  bannerTitle: {
    color: "#3A210A",
    fontFamily: pixelFont,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  bannerSubtitle: {
    color: "#2A1707",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 2,
    textAlign: "center",
  },
  pageContainer: {
    flex: 1,
  },
  eviePanel: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(24, 80, 34, 0.95)",
    borderWidth: 3,
    borderColor: "#8B5E16",
    borderRadius: 7,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  evieImage: {
    width: 50,
    height: 50,
    marginRight: 10,
  },
  evieText: {
    flex: 1,
    color: "#FFF8E6",
    fontFamily: readableFont,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 15,
  },
  evieName: {
    color: "#9BE331",
    fontWeight: "900",
    fontSize: 15,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  numberBadge: {
    width: 34,
    minHeight: 40,
    backgroundColor: "#3D2408",
    borderWidth: 3,
    borderColor: "#D99A16",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 5,
    marginTop: 1,
  },
  numberBadgeText: {
    color: "#FFF8E6",
    fontFamily: pixelFont,
    fontSize: 23,
    fontWeight: "900",
    textShadowColor: "#1B0C01",
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 0,
  },
  sectionPanel: {
    flex: 1,
    backgroundColor: "rgba(250, 220, 157, 0.86)",
    borderWidth: 2,
    borderColor: "#4B2A0B",
    borderRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  sectionTitle: {
    color: "#2A1707",
    fontFamily: pixelFont,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  input: {
    minHeight: 38,
    backgroundColor: "rgba(255, 242, 201, 0.92)",
    borderWidth: 2,
    borderColor: "#6F4312",
    borderRadius: 2,
    color: "#1F1306",
    fontFamily: readableFont,
    fontSize: 16,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  helperText: {
    color: "#3D2408",
    fontFamily: readableFont,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
    lineHeight: 15,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 5,
  },
  categoryButton: {
    width: "49%",
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 236, 185, 0.86)",
    borderWidth: 2,
    borderColor: "#A46B1C",
    borderRadius: 4,
    padding: 6,
  },
  categoryButtonActive: {
    backgroundColor: "rgba(255, 214, 114, 0.95)",
    borderColor: "#166534",
  },
  categoryIcon: {
    width: 31,
    textAlign: "center",
    fontSize: 23,
    marginRight: 5,
  },
  categoryCopy: {
    flex: 1,
  },
  categoryText: {
    color: "#2A1707",
    fontFamily: pixelFont,
    fontWeight: "900",
    fontSize: 13,
    lineHeight: 15,
  },
  categoryTextActive: {
    color: "#0F3D18",
  },
  categoryMeaningText: {
    color: "#3D2408",
    fontFamily: readableFont,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 13,
    marginTop: 2,
  },
  categoryMeaningTextActive: {
    color: "#17260D",
  },
  milestoneHint: {
    color: "#3D2408",
    fontFamily: readableFont,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    marginBottom: 6,
  },
  betaNoteText: {
    color: "#6B4A1A",
    fontFamily: readableFont,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
    marginBottom: 10,
  },
  generateButtonSecondary: {
    alignSelf: "center",
    marginTop: 10,
    backgroundColor: "rgba(255, 239, 197, 0.5)",
    borderWidth: 2,
    borderColor: "#A46B1C",
    borderRadius: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  generateButtonDisabled: {
    opacity: 0.45,
  },
  clearSupplementaryBtn: {
    alignSelf: "center",
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  clearSupplementaryText: {
    color: "#6B4A1A",
    fontFamily: readableFont,
    fontSize: 11,
    fontWeight: "800",
    textDecorationLine: "underline",
  },
  generateButtonSecondaryText: {
    color: "#4B2A0B",
    fontFamily: pixelFont,
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  milestoneGrid: {
    gap: 12,
  },
  milestoneCard: {
    backgroundColor: "rgba(255, 239, 197, 0.9)",
    borderWidth: 2,
    borderColor: "#A46B1C",
    borderRadius: 6,
    padding: 10,
    gap: 8,
  },
  milestoneBanner: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#2A1707",
    borderRadius: 3,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  milestoneBannerText: {
    color: "#FFF8E6",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
  },
  milestoneIcon: {
    display: "none",
  },
  milestoneCaption: {
    color: "#2A1707",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
  },
  milestoneInput: {
    width: "100%",
    minHeight: 88,
    maxHeight: 160,
    backgroundColor: "rgba(255, 246, 214, 0.96)",
    borderWidth: 2,
    borderColor: "#A46B1C",
    borderRadius: 4,
    color: "#1F1306",
    fontFamily: readableFont,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
    paddingHorizontal: 10,
    paddingVertical: 10,
    textAlignVertical: "top",
  },
  resourceList: {
    gap: 4,
  },
  toggleButton: {
    minHeight: 28,
    backgroundColor: "rgba(255, 242, 201, 0.72)",
    borderWidth: 1,
    borderColor: "#A46B1C",
    borderRadius: 3,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  activeToggleButton: {
    backgroundColor: "rgba(218, 247, 166, 0.82)",
    borderColor: "#166534",
  },
  toggleText: {
    color: "#2A1707",
    fontFamily: readableFont,
    fontSize: 12,
    fontWeight: "800",
  },
  activeToggleText: {
    color: "#0F3D18",
  },
  obstacleInput: {
    marginTop: 0,
    minHeight: 58,
    fontSize: 15,
  },
  validationText: {
    color: "#7F1D1D",
    backgroundColor: "rgba(254, 226, 226, 0.92)",
    borderWidth: 2,
    borderColor: "#B91C1C",
    borderRadius: 4,
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 17,
    padding: 8,
    marginVertical: 6,
  },
  saveButton: {
    minHeight: 54,
    backgroundColor: "#14532D",
    borderWidth: 4,
    borderColor: "#F3B32B",
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 3,
    marginHorizontal: 26,
    shadowColor: "#2B1403",
    shadowOpacity: 0.65,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  saveButtonText: {
    color: "#FFF8E6",
    fontFamily: pixelFont,
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: 1.5,
    textShadowColor: "#1B0C01",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  infoBtn: {
    width: 26,
    height: 26,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#9BE331",
    backgroundColor: "rgba(20, 83, 45, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    marginLeft: 6,
  },
  infoBtnText: {
    color: "#9BE331",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 17,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.82)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  modalCard: {
    backgroundColor: "#0A1A0C",
    borderWidth: 2,
    borderColor: "#22C55E",
    borderRadius: 12,
    padding: 16,
    overflow: "hidden",
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalScrollContent: {
    paddingBottom: 4,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  modalAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: "#4ADE80",
    backgroundColor: "rgba(20, 83, 45, 0.72)",
  },
  modalGuideName: {
    color: "#4ADE80",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
  },
  modalTitle: {
    color: "#F8F1D7",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 2,
  },
  modalDivider: {
    height: 2,
    backgroundColor: "rgba(34, 197, 94, 0.28)",
    marginBottom: 10,
  },
  modalBulletRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  modalBullet: {
    color: "#4ADE80",
    fontFamily: pixelFont,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 19,
  },
  modalBulletText: {
    flex: 1,
    color: "#F8F1D7",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
  },
  modalCloseBtn: {
    marginTop: 12,
    borderWidth: 2,
    borderColor: "#22C55E",
    borderRadius: 5,
    paddingVertical: 10,
    alignItems: "center",
  },
  modalCloseBtnText: {
    color: "#4ADE80",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
  },
});