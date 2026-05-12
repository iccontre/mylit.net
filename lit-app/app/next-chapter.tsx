import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type UserProfile = {
  name: string;
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

export default function NextChapterScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);

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
      <Text style={styles.title}>Next Chapter</Text>

      <View style={styles.lunaCard}>
        <Text style={styles.lunaName}>🌙 Luna</Text>
        <Text style={styles.lunaText}>
          Your goals are allowed to change. You can start with Recovery, grow into
          Progress, and choose a new chapter when your life starts feeling different.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Current Path</Text>
        <Text style={styles.goalText}>1. {goalOne || "No goal yet"}</Text>
        <Text style={styles.goalText}>2. {goalTwo || "No goal yet"}</Text>
        <Text style={styles.goalText}>3. {goalThree || "No goal yet"}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Choose a Chapter Direction</Text>
        <Text style={styles.helperText}>
          These are examples. You can choose one or write your own version below.
        </Text>

        <TouchableOpacity style={styles.chapterButton} onPress={setRecoveryExample}>
          <Text style={styles.chapterTitle}>Recovery Chapter</Text>
          <Text style={styles.chapterText}>Sleep, journaling, small steps, stability.</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.chapterButton} onPress={setConnectionExample}>
          <Text style={styles.chapterTitle}>Connection Chapter</Text>
          <Text style={styles.chapterText}>Friends, confidence, social growth.</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.chapterButton} onPress={setFutureExample}>
          <Text style={styles.chapterTitle}>Future Chapter</Text>
          <Text style={styles.chapterText}>Money, skills, projects, career direction.</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.levelButton} onPress={levelUpCurrentGoals}>
          <Text style={styles.levelButtonText}>Level Up Current Goals</Text>
        </TouchableOpacity>
      </View>

      {chapterNote ? (
        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>Luna’s Suggestion</Text>
          <Text style={styles.noteText}>{chapterNote}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Edit Your Next Chapter</Text>

        <Text style={styles.label}>What does progress mean now?</Text>
        <TextInput
          style={styles.textArea}
          multiline
          value={progressMeaning}
          onChangeText={setProgressMeaning}
          placeholder="Example: Progress means making more friends, sleeping better, or building money skills."
          placeholderTextColor="#9CA3AF"
        />

        <Text style={styles.label}>Life direction 1</Text>
        <TextInput
          style={styles.input}
          value={goalOne}
          onChangeText={setGoalOne}
          placeholder="Example: make money"
          placeholderTextColor="#9CA3AF"
        />

        <Text style={styles.label}>Life direction 2</Text>
        <TextInput
          style={styles.input}
          value={goalTwo}
          onChangeText={setGoalTwo}
          placeholder="Example: build a useful skill"
          placeholderTextColor="#9CA3AF"
        />

        <Text style={styles.label}>Life direction 3</Text>
        <TextInput
          style={styles.input}
          value={goalThree}
          onChangeText={setGoalThree}
          placeholder="Example: start a project"
          placeholderTextColor="#9CA3AF"
        />

        <TouchableOpacity style={styles.saveButton} onPress={saveNextChapter}>
          <Text style={styles.saveButtonText}>Save Next Chapter</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.truthCard}>
        <Text style={styles.truthTitle}>Remember</Text>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7EBC8",
  },
  container: {
    padding: 24,
    paddingTop: 70,
    paddingBottom: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 18,
  },
  lunaCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#E5D39A",
  },
  lunaName: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 8,
  },
  lunaText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#374151",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#E5D39A",
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: "900",
    color: "#6B7280",
    textTransform: "uppercase",
    marginBottom: 10,
  },
  goalText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#111827",
    fontWeight: "800",
    marginBottom: 4,
  },
  helperText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#6B7280",
    marginBottom: 14,
  },
  chapterButton: {
    backgroundColor: "#F3F4F6",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  chapterTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 4,
  },
  chapterText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#6B7280",
    fontWeight: "700",
  },
  levelButton: {
    backgroundColor: "#111827",
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
    marginTop: 4,
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  levelButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  noteCard: {
    backgroundColor: "#312E81",
    borderRadius: 22,
    padding: 18,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#FBBF24",
    marginBottom: 6,
  },
  noteText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#FFFFFF",
  },
  label: {
    fontSize: 14,
    fontWeight: "900",
    color: "#374151",
    marginBottom: 10,
    marginTop: 12,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    padding: 14,
    fontSize: 16,
    color: "#111827",
    marginBottom: 6,
  },
  textArea: {
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    padding: 14,
    minHeight: 100,
    fontSize: 16,
    color: "#111827",
    marginBottom: 6,
    textAlignVertical: "top",
  },
  saveButton: {
    backgroundColor: "#FBBF24",
    padding: 18,
    borderRadius: 20,
    alignItems: "center",
    marginTop: 16,
    borderWidth: 2,
    borderColor: "#111827",
  },
  saveButtonText: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900",
  },
  truthCard: {
    backgroundColor: "#111827",
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  truthTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FBBF24",
    marginBottom: 8,
  },
  truthText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#FFFFFF",
  },
  homeButton: {
    backgroundColor: "#FFFFFF",
    padding: 18,
    borderRadius: 20,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#111827",
  },
  homeButtonText: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900",
  },
});
