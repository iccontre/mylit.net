import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type UserProfile = {
  name: string;
  longTermDream?: string;
  dreamCategory?: string;
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

export default function NextChapterScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [longTermDream, setLongTermDream] = useState("");
  const [dreamCategory, setDreamCategory] = useState("");
  const [goalOne, setGoalOne] = useState("");
  const [goalTwo, setGoalTwo] = useState("");
  const [goalThree, setGoalThree] = useState("");
  const [progressMeaning, setProgressMeaning] = useState("");
  const [chapterNote, setChapterNote] = useState("");

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const saved = await AsyncStorage.getItem(PROFILE_KEY);

    if (saved) {
      const parsed: UserProfile = JSON.parse(saved);
      setProfile(parsed);
      setLongTermDream(parsed.longTermDream || "");
      setDreamCategory(parsed.dreamCategory || "");
      setGoalOne(parsed.goalOne || "");
      setGoalTwo(parsed.goalTwo || "");
      setGoalThree(parsed.goalThree || "");
      setProgressMeaning(parsed.progressMeaning || "");
    }
  }

  async function saveNextChapter() {
    if (!profile) return;

    const updatedProfile: UserProfile = {
      ...profile,
      longTermDream: longTermDream.trim(),
      dreamCategory: dreamCategory.trim(),
      goalOne: goalOne.trim(),
      goalTwo: goalTwo.trim(),
      goalThree: goalThree.trim(),
      progressMeaning: progressMeaning.trim(),
    };

    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(updatedProfile));
    setProfile(updatedProfile);
    setChapterNote("");
  }

  function setRecoveryExample() {
    setGoalOne("improve sleep");
    setGoalTwo("journal honestly");
    setGoalThree("take one small step daily");
    setProgressMeaning("Progress means recovering enough to keep going without shame.");
  }

  function setConnectionExample() {
    setGoalOne("make new friends");
    setGoalTwo("build confidence socially");
    setGoalThree("reach out to people more often");
    setProgressMeaning("Progress means building connection and feeling less alone.");
  }

  function setFutureExample() {
    setGoalOne("make money");
    setGoalTwo("build a useful skill");
    setGoalThree("create a project or portfolio");
    setProgressMeaning("Progress means creating more freedom and opportunity over time.");
  }

  function levelUpCurrentGoals() {
    setProgressMeaning(
      "Progress means taking a slightly stronger step while still respecting my energy and current life."
    );
    setChapterNote(
      "Luna suggestion: Keep your current goals, but make the next step slightly more active this week."
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.shell}>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>PATH UPDATE</Text>
          <Text style={styles.title}>SET YOUR NEXT LONG-TERM GOAL</Text>
          <Text style={styles.subtitle}>Update the direction your quests should follow.</Text>
        </View>

        <View style={styles.lunaCard}>
          <Text style={styles.lunaName}>Luna</Text>
          <Text style={styles.lunaText}>
            Your direction can change. Choose the next path that fits your real life right now.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>CURRENT DIRECTION</Text>
          <Text style={styles.statText}>Long-term dream: {longTermDream || "Not set yet"}</Text>
          <Text style={styles.statText}>Category: {dreamCategory || "Not set yet"}</Text>
          <Text style={styles.goalText}>1. {goalOne || "Not set yet"}</Text>
          <Text style={styles.goalText}>2. {goalTwo || "Not set yet"}</Text>
          <Text style={styles.goalText}>3. {goalThree || "Not set yet"}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>CHOOSE A DIRECTION</Text>
          <Text style={styles.helperText}>
            These are examples. You can choose one or write your own version below.
          </Text>

          <TouchableOpacity style={[styles.chapterButton, styles.recoveryBorder]} onPress={setRecoveryExample}>
            <Text style={styles.chapterTitle}>Recovery Direction</Text>
            <Text style={styles.chapterText}>Sleep, journaling, small steps, stability.</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chapterButton, styles.connectionBorder]}
            onPress={setConnectionExample}
          >
            <Text style={styles.chapterTitle}>Connection Direction</Text>
            <Text style={styles.chapterText}>Friends, confidence, social growth.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.chapterButton, styles.futureBorder]} onPress={setFutureExample}>
            <Text style={styles.chapterTitle}>Future Direction</Text>
            <Text style={styles.chapterText}>Money, skills, projects, career direction.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.levelButton} onPress={levelUpCurrentGoals}>
            <Text style={styles.levelButtonText}>Make Current Goals Stronger</Text>
          </TouchableOpacity>
        </View>

        {chapterNote ? (
          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>UPDATE MESSAGE</Text>
            <Text style={styles.noteText}>{chapterNote}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>EDIT YOUR NEXT PATH</Text>

          <Text style={styles.label}>Long-term dream</Text>
          <TextInput
            style={styles.textArea}
            multiline
            value={longTermDream}
            onChangeText={setLongTermDream}
            placeholder="Example: Build a stable life with strong health, focus, and income."
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.label}>Dream category</Text>
          <TextInput
            style={styles.input}
            value={dreamCategory}
            onChangeText={setDreamCategory}
            placeholder="Example: School / Work"
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.label}>What does progress mean now?</Text>
          <TextInput
            style={styles.textArea}
            multiline
            value={progressMeaning}
            onChangeText={setProgressMeaning}
            placeholder="Example: Progress means making more friends, sleeping better, or building money skills."
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.label}>Life direction 1</Text>
          <TextInput
            style={styles.input}
            value={goalOne}
            onChangeText={setGoalOne}
            placeholder="Example: make money"
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.label}>Life direction 2</Text>
          <TextInput
            style={styles.input}
            value={goalTwo}
            onChangeText={setGoalTwo}
            placeholder="Example: build a useful skill"
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.label}>Life direction 3</Text>
          <TextInput
            style={styles.input}
            value={goalThree}
            onChangeText={setGoalThree}
            placeholder="Example: start a project"
            placeholderTextColor="#94A3B8"
          />

          <TouchableOpacity style={styles.saveButton} onPress={saveNextChapter}>
            <Text style={styles.saveButtonText}>Save Long-Term Goal</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.truthCard}>
          <Text style={styles.truthTitle}>REMINDER</Text>
          <Text style={styles.truthText}>
            Leveling up does not mean abandoning who you are. It means choosing a new
            step because your life, energy, or confidence has changed.
          </Text>
        </View>

        <Link href="/" asChild>
          <TouchableOpacity style={styles.homeButton}>
            <Text style={styles.homeButtonText}>Back to Today</Text>
          </TouchableOpacity>
        </Link>
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
    fontSize: 28,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 8,
    letterSpacing: 0.8,
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
  cardLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#F8FAFC",
    textTransform: "uppercase",
    marginBottom: 10,
    letterSpacing: 0.8,
    fontFamily: pixelFont,
  },
  statText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#E2E8F0",
    marginBottom: 4,
    fontWeight: "700",
  },
  goalText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#F9FAFB",
    fontWeight: "800",
    marginBottom: 3,
  },
  helperText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#CBD5E1",
    marginBottom: 12,
  },
  chapterButton: {
    backgroundColor: "#1F2937",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 2,
  },
  recoveryBorder: {
    borderColor: "#22C55E",
  },
  connectionBorder: {
    borderColor: "#38BDF8",
  },
  futureBorder: {
    borderColor: "#A78BFA",
  },
  chapterTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 4,
    fontFamily: pixelFont,
  },
  chapterText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#CBD5E1",
    fontWeight: "700",
  },
  levelButton: {
    backgroundColor: "#0F172A",
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    marginTop: 2,
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  levelButtonText: {
    color: "#F9FAFB",
    fontSize: 14,
    fontWeight: "900",
    fontFamily: pixelFont,
    letterSpacing: 0.5,
  },
  noteCard: {
    backgroundColor: "#1F2937",
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  noteTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#FDE68A",
    marginBottom: 6,
    letterSpacing: 0.7,
    fontFamily: pixelFont,
  },
  noteText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#F9FAFB",
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
    borderRadius: 16,
    padding: 12,
    fontSize: 15,
    color: "#F9FAFB",
    marginBottom: 6,
    borderWidth: 2,
    borderColor: "#334155",
  },
  textArea: {
    backgroundColor: "#020617",
    borderRadius: 16,
    padding: 12,
    minHeight: 96,
    fontSize: 15,
    color: "#F9FAFB",
    marginBottom: 6,
    textAlignVertical: "top",
    borderWidth: 2,
    borderColor: "#334155",
  },
  saveButton: {
    backgroundColor: "#166534",
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 14,
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
  truthCard: {
    backgroundColor: "#111827",
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: "#22C55E",
  },
  truthTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#86EFAC",
    marginBottom: 7,
    fontFamily: pixelFont,
    letterSpacing: 0.8,
  },
  truthText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#F9FAFB",
  },
  homeButton: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#64748B",
  },
  homeButtonText: {
    color: "#CBD5E1",
    fontSize: 15,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
});