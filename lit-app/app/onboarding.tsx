import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  GOAL_HORIZON_LABELS,
  type GoalHorizon,
  type GoalMilestoneSet,
} from "../constants/goalMilestoneTemplates";
import { logGoalFeedback } from "../lib/feedbackLog";
import {
  generateFromDatabase,
  variantCountFor,
  type GenerationSource,
} from "../lib/goalGeneration";

type DreamCategory =
  | "Health"
  | "Money"
  | "Mind"
  | "Friends / Connection"
  | "School / Work"
  | "Confidence"
  | "Creativity"
  | "Sleep"
  | "Phone Use"
  | "Purpose";

type UserProfile = {
  name: string;
  longTermDream: string;
  dreamCategory: DreamCategory | "";
  progressMeaning: string;
  // Phase 1 tiered goals
  specificGoal: string;
  shortTermGoal: string;
  midTermGoal: string;
  longTermGoal: string;
  goalsGeneratedAt?: string;
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

const PROFILE_KEY = "lit_user_profile";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

const DREAM_CATEGORIES: DreamCategory[] = [
  "Health",
  "Money",
  "Mind",
  "Friends / Connection",
  "School / Work",
  "Confidence",
  "Creativity",
  "Sleep",
  "Phone Use",
  "Purpose",
];

const HORIZON_ORDER: GoalHorizon[] = ["shortTerm", "midTerm", "longTerm"];

const EMPTY_MILESTONES: GoalMilestoneSet = {
  shortTerm: "",
  midTerm: "",
  longTerm: "",
};

const CATEGORY_SET = new Set<string>(DREAM_CATEGORIES);

export default function OnboardingScreen() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [longTermDream, setLongTermDream] = useState("");
  const [dreamCategory, setDreamCategory] = useState<DreamCategory | "">("");
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
  const [hasExistingProfile, setHasExistingProfile] = useState(false);

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
      setValidationMessage("Pick a category first so we can draft your milestones.");
      return;
    }
    setValidationMessage("");

    const nextIndex = cycle && hasGenerated ? variantIndex + 1 : variantIndex;
    const result = generateFromDatabase(
      { category: dreamCategory, specificGoal },
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
  }

  async function loadProfile() {
    const saved = await AsyncStorage.getItem(PROFILE_KEY);

    if (!saved) return;

    try {
      const profile = JSON.parse(saved) as Partial<UserProfile>;
      setHasExistingProfile(true);

      const savedCategory =
        profile.dreamCategory && CATEGORY_SET.has(profile.dreamCategory)
          ? (profile.dreamCategory as DreamCategory)
          : "";

      setName(profile.name || "");
      setLongTermDream(profile.longTermDream || "");
      setDreamCategory(savedCategory);
      setProgressMeaning(profile.progressMeaning || "");
      setSpecificGoal(profile.specificGoal || "");

      // Prefer tiered fields; fall back to legacy goalOne/Two/Three so users
      // who set up their path before this flow existed don't lose anything.
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
      setValidationMessage("Tap Generate to draft your milestones (and edit them if you like).");
      return;
    }

    setValidationMessage("");

    const finalMilestones: GoalMilestoneSet = {
      shortTerm: shortTermGoal.trim(),
      midTerm: midTermGoal.trim(),
      longTerm: longTermGoal.trim(),
    };

    const profile: UserProfile = {
      name: trimmedName,
      longTermDream: trimmedDream,
      dreamCategory,
      progressMeaning: progressMeaning.trim(),
      specificGoal: specificGoal.trim(),
      shortTermGoal: finalMilestones.shortTerm,
      midTermGoal: finalMilestones.midTerm,
      longTermGoal: finalMilestones.longTerm,
      goalsGeneratedAt: new Date().toISOString(),
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

    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));

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

    router.push("/");
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
          {value ? "✓ " : ""}
          {label}
        </Text>
      </TouchableOpacity>
    );
  }

  function MilestoneField({
    horizon,
    value,
    onChange,
  }: {
    horizon: GoalHorizon;
    value: string;
    onChange: (next: string) => void;
  }) {
    const meta = GOAL_HORIZON_LABELS[horizon];
    return (
      <View style={styles.milestoneField}>
        <View style={styles.milestoneHeaderRow}>
          <Text style={styles.label}>{meta.label}</Text>
          <Text style={styles.milestoneCaption}>{meta.caption}</Text>
        </View>
        <TextInput
          style={styles.input}
          placeholder={`Your ${meta.label.toLowerCase()}`}
          placeholderTextColor="#94A3B8"
          value={value}
          onChangeText={onChange}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.shell}>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>PATH SETUP</Text>
          <Text style={styles.title}>SET MY PATH</Text>
          <Text style={styles.subtitle}>Choose the dream your quests should follow.</Text>
        </View>

        <View style={styles.lunaCard}>
          <Text style={styles.lunaName}>Luna</Text>
          <Text style={styles.lunaText}>
            Pick a category and tell me the specific goal that lives under your dream. I&apos;ll draft three milestones —
            short-term, mid-term, long-term — that you can keep, edit, or regenerate.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Your name</Text>
          <TextInput
            style={styles.input}
            placeholder="Example: Isaac"
            placeholderTextColor="#94A3B8"
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>Choose the category that fits your dream</Text>
          <View style={styles.categoryGrid}>
            {DREAM_CATEGORIES.map((category) => {
              const selected = dreamCategory === category;
              return (
                <TouchableOpacity
                  key={category}
                  style={[styles.categoryButton, selected && styles.categoryButtonActive]}
                  onPress={() => applyCategory(category)}
                >
                  <Text style={[styles.categoryText, selected && styles.categoryTextActive]}>
                    {category}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>What is your specific goal in this category?</Text>
          <TextInput
            style={styles.input}
            placeholder="Example: lose 15 lbs, save $5k, ship a small side project"
            placeholderTextColor="#94A3B8"
            value={specificGoal}
            onChangeText={setSpecificGoal}
          />

          <TouchableOpacity
            style={[styles.generateButton, !dreamCategory && styles.generateButtonDisabled]}
            onPress={() => generateMilestones(false)}
            disabled={!dreamCategory}
          >
            <Text style={styles.generateButtonText}>
              {hasGenerated ? "↻ Generate again" : "✦ Generate my milestones"}
            </Text>
          </TouchableOpacity>

          <View style={styles.previewCard}>
            <View style={styles.previewHeaderRow}>
              <Text style={styles.previewTitle}>YOUR PATH MILESTONES</Text>
              {hasGenerated && variantCountFor(dreamCategory) > 1 ? (
                <TouchableOpacity
                  style={styles.regenerateButton}
                  onPress={() => generateMilestones(true)}
                >
                  <Text style={styles.regenerateButtonText}>↻ New draft</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={styles.previewHint}>
              {milestonesEmpty
                ? "Pick a category, type your specific goal, then tap Generate to draft three milestones."
                : "Edit any milestone to make it yours — your edits are saved as higher-weight training signal."}
            </Text>
          </View>

          {HORIZON_ORDER.map((horizon) => {
            if (horizon === "shortTerm") {
              return (
                <MilestoneField
                  key={horizon}
                  horizon={horizon}
                  value={shortTermGoal}
                  onChange={setShortTermGoal}
                />
              );
            }
            if (horizon === "midTerm") {
              return (
                <MilestoneField
                  key={horizon}
                  horizon={horizon}
                  value={midTermGoal}
                  onChange={setMidTermGoal}
                />
              );
            }
            return (
              <MilestoneField
                key={horizon}
                horizon={horizon}
                value={longTermGoal}
                onChange={setLongTermGoal}
              />
            );
          })}

          <Text style={styles.label}>What does progress mean to you right now?</Text>
          <TextInput
            style={styles.textArea}
            multiline
            placeholder="Example: being consistent, sleeping better, and taking honest action daily."
            placeholderTextColor="#94A3B8"
            value={progressMeaning}
            onChangeText={setProgressMeaning}
          />

          <Text style={styles.label}>What usually gets in your way?</Text>
          <TextInput
            style={styles.textArea}
            multiline
            placeholder="Example: phone use, anxiety, low energy, school pressure, transportation..."
            placeholderTextColor="#94A3B8"
            value={biggestObstacle}
            onChangeText={setBiggestObstacle}
          />

          {validationMessage ? <Text style={styles.validationText}>{validationMessage}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>YOUR CURRENT RESOURCES</Text>
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

        <TouchableOpacity style={styles.saveButton} onPress={saveProfile}>
          <Text style={styles.saveButtonText}>Save My Path</Text>
        </TouchableOpacity>

        {hasExistingProfile ? (
          <TouchableOpacity style={styles.skipButton} onPress={() => router.push("/")}>
            <Text style={styles.skipButtonText}>Back to Today</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0B1220",
  },
  container: {
    paddingTop: 28,
    paddingBottom: 42,
  },
  shell: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 18,
  },
  hero: {
    backgroundColor: "#0F1E1A",
    borderColor: "#FBBF24",
    borderWidth: 3,
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
  },
  heroLabel: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: "800",
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 8,
    letterSpacing: 1,
    fontFamily: pixelFont,
  },
  subtitle: {
    fontSize: 14,
    color: "#D1FAE5",
    lineHeight: 21,
    fontWeight: "600",
  },
  lunaCard: {
    backgroundColor: "#132A23",
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: "#22C55E",
  },
  lunaName: {
    fontSize: 18,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 8,
    letterSpacing: 0.8,
    fontFamily: pixelFont,
  },
  lunaText: {
    fontSize: 14,
    color: "#DCFCE7",
    lineHeight: 20,
  },
  card: {
    backgroundColor: "#111827",
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: "#334155",
  },
  label: {
    fontSize: 12,
    fontWeight: "900",
    color: "#F8FAFC",
    marginBottom: 8,
    marginTop: 10,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontFamily: pixelFont,
  },
  input: {
    backgroundColor: "#020617",
    borderRadius: 14,
    padding: 12,
    fontSize: 15,
    color: "#F9FAFB",
    marginBottom: 6,
    borderWidth: 2,
    borderColor: "#334155",
  },
  textArea: {
    backgroundColor: "#020617",
    borderRadius: 14,
    padding: 12,
    minHeight: 90,
    fontSize: 15,
    color: "#F9FAFB",
    marginBottom: 6,
    textAlignVertical: "top",
    borderWidth: 2,
    borderColor: "#334155",
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 10,
    marginTop: 2,
  },
  categoryButton: {
    backgroundColor: "#1F2937",
    borderWidth: 2,
    borderColor: "#22C55E",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 8,
    width: "48.5%",
    minHeight: 46,
    justifyContent: "center",
  },
  categoryButtonActive: {
    backgroundColor: "#FBBF24",
    borderColor: "#F59E0B",
  },
  categoryText: {
    color: "#E5E7EB",
    fontWeight: "800",
    fontSize: 13,
    textAlign: "center",
  },
  categoryTextActive: {
    color: "#111827",
  },
  previewCard: {
    backgroundColor: "#1F2937",
    borderColor: "#FBBF24",
    borderWidth: 2,
    borderRadius: 14,
    padding: 13,
    marginTop: 6,
    marginBottom: 8,
  },
  previewHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#FDE68A",
    letterSpacing: 0.8,
    fontFamily: pixelFont,
  },
  previewHint: {
    fontSize: 12,
    color: "#CBD5E1",
    lineHeight: 17,
  },
  generateButton: {
    backgroundColor: "#166534",
    borderColor: "#FBBF24",
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 4,
  },
  generateButtonDisabled: {
    opacity: 0.4,
  },
  generateButtonText: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 0.8,
  },
  regenerateButton: {
    backgroundColor: "#0F172A",
    borderColor: "#22C55E",
    borderWidth: 2,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  regenerateButtonText: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 0.6,
  },
  milestoneField: {
    marginTop: 4,
  },
  milestoneHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  milestoneCaption: {
    color: "#94A3B8",
    fontSize: 11,
    fontFamily: pixelFont,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 10,
    letterSpacing: 0.5,
  },
  validationText: {
    color: "#FCA5A5",
    fontSize: 13,
    marginTop: 10,
    fontWeight: "700",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 8,
    letterSpacing: 0.8,
    fontFamily: pixelFont,
  },
  toggleButton: {
    backgroundColor: "#1F2937",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "#334155",
  },
  activeToggleButton: {
    backgroundColor: "#0F172A",
    borderColor: "#FBBF24",
  },
  toggleText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#E5E7EB",
  },
  activeToggleText: {
    color: "#F9FAFB",
  },
  saveButton: {
    backgroundColor: "#166534",
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  saveButtonText: {
    color: "#F9FAFB",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.8,
    fontFamily: pixelFont,
  },
  skipButton: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#64748B",
  },
  skipButtonText: {
    color: "#CBD5E1",
    fontSize: 15,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
});
