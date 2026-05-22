import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

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

const CATEGORY_GOALS: Record<DreamCategory, { goalOne: string; goalTwo: string; goalThree: string }> = {
  Health: {
    goalOne: "build a consistent movement routine",
    goalTwo: "improve daily nutrition",
    goalThree: "protect sleep and recovery",
  },
  Money: {
    goalOne: "build a useful money skill",
    goalTwo: "find an income opportunity",
    goalThree: "track spending and saving",
  },
  Mind: {
    goalOne: "journal consistently",
    goalTwo: "notice thought patterns",
    goalThree: "practice awareness before reacting",
  },
  "Friends / Connection": {
    goalOne: "reach out to one person",
    goalTwo: "build social confidence",
    goalThree: "create meaningful connections",
  },
  "School / Work": {
    goalOne: "complete one focus block",
    goalTwo: "plan assignments earlier",
    goalThree: "build weekly consistency",
  },
  Confidence: {
    goalOne: "keep one promise to myself",
    goalTwo: "practice one uncomfortable but safe action",
    goalThree: "reflect on small wins",
  },
  Creativity: {
    goalOne: "work on one creative project",
    goalTwo: "share or save one idea",
    goalThree: "make time for practice",
  },
  Sleep: {
    goalOne: "improve sleep consistency",
    goalTwo: "reduce phone use before bed",
    goalThree: "use recovery when needed",
  },
  "Phone Use": {
    goalOne: "notice screen-time triggers",
    goalTwo: "replace scrolling with one small action",
    goalThree: "create phone-free focus time",
  },
  Purpose: {
    goalOne: "define what progress means to me",
    goalTwo: "take one honest step daily",
    goalThree: "reflect on what feels meaningful",
  },
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
    const profile: UserProfile = {
      name: name.trim(),
      longTermDream: longTermDream.trim(),
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
        <Text style={[styles.toggleText, value && styles.activeToggleText]}>{value ? "✓ " : ""}{label}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.logo}>lit</Text>
      <Text style={styles.subtitle}>Living in Truth</Text>

      <View style={styles.lunaCard}>
        <Text style={styles.lunaName}>🌙 Luna</Text>
        <Text style={styles.lunaText}>Before we build your path, I want to understand your long-term dream and what progress means to you.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Your name</Text>
        <TextInput style={styles.input} placeholder="Example: Isaac" placeholderTextColor="#9CA3AF" value={name} onChangeText={setName} />

        <Text style={styles.label}>What is your long-term dream?</Text>
        <TextInput style={styles.textArea} multiline placeholder="Example: I want to feel healthy, financially stable, and proud of my day-to-day life." placeholderTextColor="#9CA3AF" value={longTermDream} onChangeText={setLongTermDream} />

        <Text style={styles.label}>Choose the category that fits your dream</Text>
        <View style={styles.categoryGrid}>
          {DREAM_CATEGORIES.map((category) => {
            const selected = dreamCategory === category;
            return (
              <TouchableOpacity key={category} style={[styles.categoryButton, selected && styles.categoryButtonActive]} onPress={() => applyCategory(category)}>
                <Text style={[styles.categoryText, selected && styles.categoryTextActive]}>{category}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.previewCard}>
          <Text style={styles.previewTitle}>Your starting path</Text>
          <Text style={styles.goalText}>1. {pathPreview.goalOne || "Choose a category to auto-fill your path"}</Text>
          <Text style={styles.goalText}>2. {pathPreview.goalTwo || ""}</Text>
          <Text style={styles.goalText}>3. {pathPreview.goalThree || ""}</Text>
        </View>

        <Text style={styles.label}>What does progress mean to you right now?</Text>
        <TextInput style={styles.textArea} multiline placeholder="Example: being consistent, sleeping better, and taking honest action daily." placeholderTextColor="#9CA3AF" value={progressMeaning} onChangeText={setProgressMeaning} />

        <Text style={styles.label}>What usually gets in your way?</Text>
        <TextInput style={styles.textArea} multiline placeholder="Example: phone use, anxiety, low energy, school pressure, transportation..." placeholderTextColor="#9CA3AF" value={biggestObstacle} onChangeText={setBiggestObstacle} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Your current resources</Text>
        <ToggleButton label="I have work or school responsibilities" value={hasWorkOrSchool} onPress={() => setHasWorkOrSchool(!hasWorkOrSchool)} />
        <ToggleButton label="I usually have transportation" value={hasTransportation} onPress={() => setHasTransportation(!hasTransportation)} />
        <ToggleButton label="I have gym access" value={hasGymAccess} onPress={() => setHasGymAccess(!hasGymAccess)} />
        <ToggleButton label="I have a quiet study/work space" value={hasQuietSpace} onPress={() => setHasQuietSpace(!hasQuietSpace)} />
        <ToggleButton label="I have control over food/meals" value={hasFoodControl} onPress={() => setHasFoodControl(!hasFoodControl)} />
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={saveProfile}>
        <Text style={styles.saveButtonText}>Save My Path</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.skipButton} onPress={() => router.push("/")}>
        <Text style={styles.skipButtonText}>Skip for now</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7EBC8" },
  container: { padding: 24, paddingTop: 70, paddingBottom: 40 },
  logo: { fontSize: 52, fontWeight: "900", color: "#111827", letterSpacing: -2 },
  subtitle: { fontSize: 16, color: "#6B7280", marginTop: -4, marginBottom: 24 },
  lunaCard: { backgroundColor: "#FFFFFF", borderRadius: 24, padding: 20, marginBottom: 18, borderWidth: 2, borderColor: "#E5D39A" },
  lunaName: { fontSize: 22, fontWeight: "900", color: "#111827", marginBottom: 8 },
  lunaText: { fontSize: 16, lineHeight: 24, color: "#374151" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 24, padding: 20, marginBottom: 18, borderWidth: 2, borderColor: "#E5D39A" },
  label: { fontSize: 14, fontWeight: "900", color: "#374151", marginBottom: 10, marginTop: 12, textTransform: "uppercase" },
  input: { backgroundColor: "#F3F4F6", borderRadius: 16, padding: 14, fontSize: 16, color: "#111827", marginBottom: 6 },
  textArea: { backgroundColor: "#F3F4F6", borderRadius: 16, padding: 14, minHeight: 96, fontSize: 16, color: "#111827", marginBottom: 6, textAlignVertical: "top" },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  categoryButton: { backgroundColor: "#F3F4F6", borderWidth: 2, borderColor: "#E5E7EB", borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  categoryButtonActive: { backgroundColor: "#111827", borderColor: "#FBBF24" },
  categoryText: { color: "#374151", fontWeight: "800", fontSize: 14 },
  categoryTextActive: { color: "#FFFFFF" },
  previewCard: { backgroundColor: "#FFFBEB", borderColor: "#FCD34D", borderWidth: 2, borderRadius: 16, padding: 14, marginTop: 8, marginBottom: 6 },
  previewTitle: { fontSize: 16, fontWeight: "900", color: "#92400E", marginBottom: 8 },
  goalText: { fontSize: 15, color: "#78350F", marginBottom: 4, fontWeight: "700" },
  sectionTitle: { fontSize: 22, fontWeight: "900", color: "#111827", marginBottom: 8 },
  toggleButton: { backgroundColor: "#F3F4F6", borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 2, borderColor: "#E5E7EB" },
  activeToggleButton: { backgroundColor: "#111827", borderColor: "#FBBF24" },
  toggleText: { fontSize: 15, fontWeight: "800", color: "#374151" },
  activeToggleText: { color: "#FFFFFF" },
  saveButton: { backgroundColor: "#111827", padding: 18, borderRadius: 20, alignItems: "center", marginBottom: 12 },
  saveButtonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "900" },
  skipButton: { backgroundColor: "#FFFFFF", padding: 16, borderRadius: 20, alignItems: "center", borderWidth: 2, borderColor: "#D1D5DB" },
  skipButtonText: { color: "#374151", fontSize: 16, fontWeight: "900" },
});