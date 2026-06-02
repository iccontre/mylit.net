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

type DreamCategory = "Health" | "School / Work" | "Social Life" | "Purpose";

type UserProfile = {
  name: string;
  longTermDream: string;
  dreamCategory: DreamCategory | "";
  progressMeaning: string;
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

const CATEGORY_GOALS: Record<DreamCategory, { goalOne: string; goalTwo: string; goalThree: string }> = {
  Health: {
    goalOne: "improve my sleep and energy",
    goalTwo: "build a consistent fitness habit",
    goalThree: "make healthier daily choices",
  },
  "School / Work": {
    goalOne: "complete one focus block",
    goalTwo: "stay ahead of assignments",
    goalThree: "build weekly consistency",
  },
  "Social Life": {
    goalOne: "reach out to one person",
    goalTwo: "practice starting conversations",
    goalThree: "build confidence with people",
  },
  Purpose: {
    goalOne: "choose one honest direction",
    goalTwo: "take one small step daily",
    goalThree: "reflect on what feels meaningful",
  },
};

const CATEGORY_MEANINGS: Record<DreamCategory, string> = {
  Health: "fitness, better sleep, energy, body, wellness",
  "School / Work": "homework, studying, coding, career, productivity",
  "Social Life": "friends, confidence with people, meeting new people, connection",
  Purpose: "direction, identity, meaning, creativity, confidence, general growth",
};

const DREAM_CATEGORIES = Object.keys(CATEGORY_GOALS) as DreamCategory[];

export default function OnboardingScreen() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [longTermDream, setLongTermDream] = useState("");
  const [dreamCategory, setDreamCategory] = useState<DreamCategory | "">("");
  const [progressMeaning, setProgressMeaning] = useState("");
  const [goalOne, setGoalOne] = useState("");
  const [goalTwo, setGoalTwo] = useState("");
  const [goalThree, setGoalThree] = useState("");
  const [biggestObstacle, setBiggestObstacle] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const [hasExistingProfile, setHasExistingProfile] = useState(false);

  const [hasWorkOrSchool, setHasWorkOrSchool] = useState(true);
  const [hasTransportation, setHasTransportation] = useState(false);
  const [hasGymAccess, setHasGymAccess] = useState(false);
  const [hasQuietSpace, setHasQuietSpace] = useState(false);
  const [hasFoodControl, setHasFoodControl] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const pathPreview = useMemo(() => {
    if (dreamCategory) return CATEGORY_GOALS[dreamCategory];
    return { goalOne, goalTwo, goalThree };
  }, [dreamCategory, goalOne, goalTwo, goalThree]);

  function applyCategory(category: DreamCategory) {
    setDreamCategory(category);
    const mappedGoals = CATEGORY_GOALS[category];
    setGoalOne(mappedGoals.goalOne);
    setGoalTwo(mappedGoals.goalTwo);
    setGoalThree(mappedGoals.goalThree);
  }

  async function loadProfile() {
    const saved = await AsyncStorage.getItem(PROFILE_KEY);

    if (saved) {
      setHasExistingProfile(true);
      const profile = JSON.parse(saved) as Partial<UserProfile>;
      const savedCategory =
        profile.dreamCategory && profile.dreamCategory in CATEGORY_GOALS
          ? (profile.dreamCategory as DreamCategory)
          : "";

      setName(profile.name || "");
      setLongTermDream(profile.longTermDream || "");
      setDreamCategory(savedCategory);
      setProgressMeaning(profile.progressMeaning || "");
      setGoalOne(profile.goalOne || "");
      setGoalTwo(profile.goalTwo || "");
      setGoalThree(profile.goalThree || "");
      setBiggestObstacle(profile.biggestObstacle || "");
      setHasWorkOrSchool(profile.hasWorkOrSchool ?? true);
      setHasTransportation(profile.hasTransportation ?? false);
      setHasGymAccess(profile.hasGymAccess ?? false);
      setHasQuietSpace(profile.hasQuietSpace ?? false);
      setHasFoodControl(profile.hasFoodControl ?? false);
    }
  }

  async function saveProfile() {
    const trimmedName = name.trim();
    const trimmedDream = longTermDream.trim();

    if (!trimmedName || !trimmedDream || !dreamCategory) {
      setValidationMessage("Please add your name, long-term dream, and a dream category.");
      return;
    }

    setValidationMessage("");

    const profile: UserProfile = {
      name: trimmedName,
      longTermDream: trimmedDream,
      dreamCategory,
      progressMeaning: progressMeaning.trim(),
      goalOne: goalOne.trim(),
      goalTwo: goalTwo.trim(),
      goalThree: goalThree.trim(),
      biggestObstacle: biggestObstacle.trim(),
      hasWorkOrSchool,
      hasTransportation,
      hasGymAccess,
      hasQuietSpace,
      hasFoodControl,
    };

    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    router.push("/");
  }

  function ToggleButton({ label, value, onPress }: { label: string; value: boolean; onPress: () => void }) {
    return (
      <TouchableOpacity style={[styles.toggleButton, value && styles.activeToggleButton]} onPress={onPress}>
        <Text style={[styles.toggleText, value && styles.activeToggleText]}>
          {value ? "✓ " : ""}
          {label}
        </Text>
      </TouchableOpacity>
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
            Before I build your path, choose the direction that feels closest to your long-term dream.
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

          <Text style={styles.label}>What is your long-term dream?</Text>
          <TextInput
            style={styles.textArea}
            multiline
            placeholder="Example: I want to feel healthy, financially stable, and proud of my day-to-day life."
            placeholderTextColor="#94A3B8"
            value={longTermDream}
            onChangeText={setLongTermDream}
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
                  <Text style={[styles.categoryMeaningText, selected && styles.categoryTextActive]}>
                    {CATEGORY_MEANINGS[category]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>YOUR STARTING PATH</Text>
            <Text style={styles.goalText}>1. {pathPreview.goalOne || "Choose a category to auto-fill your path"}</Text>
            <Text style={styles.goalText}>2. {pathPreview.goalTwo || ""}</Text>
            <Text style={styles.goalText}>3. {pathPreview.goalThree || ""}</Text>
          </View>

          <Text style={styles.goalHelperText}>Edit these goals to create the most accurate path for you.</Text>

          <Text style={styles.label}>Goal one</Text>
          <TextInput
            style={styles.input}
            placeholder="First path goal"
            placeholderTextColor="#94A3B8"
            value={goalOne}
            onChangeText={setGoalOne}
          />

          <Text style={styles.label}>Goal two</Text>
          <TextInput
            style={styles.input}
            placeholder="Second path goal"
            placeholderTextColor="#94A3B8"
            value={goalTwo}
            onChangeText={setGoalTwo}
          />

          <Text style={styles.label}>Goal three</Text>
          <TextInput
            style={styles.input}
            placeholder="Third path goal"
            placeholderTextColor="#94A3B8"
            value={goalThree}
            onChangeText={setGoalThree}
          />

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
  categoryMeaningText: {
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 5,
    textAlign: "center",
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
  previewTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#FDE68A",
    marginBottom: 7,
    letterSpacing: 0.8,
    fontFamily: pixelFont,
  },
  goalText: {
    fontSize: 14,
    color: "#F9FAFB",
    marginBottom: 4,
    fontWeight: "700",
  },
  goalHelperText: {
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    marginBottom: 6,
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