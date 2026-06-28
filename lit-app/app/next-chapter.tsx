import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { uiAssets } from "../constants/uiAssets";

type DirectionChoice = "recovery" | "connection" | "future" | "stronger" | null;

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
const APP_FRAME_ASPECT_RATIO = 1024 / 1792;
const MAX_FRAME_WIDTH = 520;
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

export default function NextChapterScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [longTermDream, setLongTermDream] = useState("");
  const [dreamCategory, setDreamCategory] = useState("");
  const [goalOne, setGoalOne] = useState("");
  const [goalTwo, setGoalTwo] = useState("");
  const [goalThree, setGoalThree] = useState("");
  const [progressMeaning, setProgressMeaning] = useState("");
  const [chapterNote, setChapterNote] = useState("");
  const [selectedDirection, setSelectedDirection] = useState<DirectionChoice>(null);

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
    setSelectedDirection("recovery");
    setGoalOne("improve sleep");
    setGoalTwo("journal honestly");
    setGoalThree("take one small step daily");
    setProgressMeaning("Progress means recovering enough to keep going without shame.");
  }

  function setConnectionExample() {
    setSelectedDirection("connection");
    setGoalOne("make new friends");
    setGoalTwo("build confidence socially");
    setGoalThree("reach out to people more often");
    setProgressMeaning("Progress means building connection and feeling less alone.");
  }

  function setFutureExample() {
    setSelectedDirection("future");
    setGoalOne("make money");
    setGoalTwo("build a useful skill");
    setGoalThree("create a project or portfolio");
    setProgressMeaning("Progress means creating more freedom and opportunity over time.");
  }

  function levelUpCurrentGoals() {
    setSelectedDirection("stronger");
    setProgressMeaning(
      "Progress means taking a slightly stronger step while still respecting my energy and current life."
    );
    setChapterNote(
      "Evie suggestion: Keep your current goals, but make the next step slightly more active this week."
    );
  }

  function DirectionCard({
    id,
    title,
    text,
    onPress,
  }: {
    id: Exclude<DirectionChoice, null>;
    title: string;
    text: string;
    onPress: () => void;
  }) {
    const selected = selectedDirection === id;

    return (
      <TouchableOpacity
        style={[styles.directionCard, selected && styles.directionCardSelected]}
        onPress={onPress}
      >
        <View style={styles.directionTopRow}>
          <Text style={[styles.directionTitle, selected && styles.directionTitleSelected]}>{title}</Text>
          <Text style={styles.directionArrow}>{selected ? "✓" : "›"}</Text>
        </View>
        <Text style={styles.directionText}>{text}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.pageRoot}>
      <View style={styles.phoneStage}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={pathBackground} style={styles.backgroundImage} resizeMode="stretch" />
        </View>

        <ScrollView style={styles.screenScroller} contentContainerStyle={styles.boardContent} showsVerticalScrollIndicator={false}>
          <View style={styles.titleBanner}>
            <Text style={styles.kicker}>PATH UPDATE</Text>
            <Text style={styles.title}>NEXT CHAPTER</Text>
            <Text style={styles.subtitle}>Choose the next direction your quests should follow.</Text>
          </View>

          <View style={styles.eviePanel}>
            <Image source={uiAssets.guides.evie} style={styles.evieImage} resizeMode="contain" />
            <Text style={styles.evieText}>
              <Text style={styles.evieName}>Evie</Text> — You finished or outgrew your current path. Choose what matters next, and I’ll help shape a new direction your quests can follow.
            </Text>
          </View>

          <View style={styles.sectionPanel}>
            <Text style={styles.sectionTitle}>1 · CURRENT PATH</Text>
            <View style={styles.summaryGrid}>
              <Text style={styles.summaryText}><Text style={styles.summaryLabel}>Dream: </Text>{longTermDream || "Not set yet"}</Text>
              <Text style={styles.summaryText}><Text style={styles.summaryLabel}>Category: </Text>{dreamCategory || "Not set yet"}</Text>
              <Text style={styles.summaryText}><Text style={styles.summaryLabel}>Short: </Text>{goalOne || "Not set yet"}</Text>
              <Text style={styles.summaryText}><Text style={styles.summaryLabel}>Mid: </Text>{goalTwo || "Not set yet"}</Text>
              <Text style={styles.summaryText}><Text style={styles.summaryLabel}>Long: </Text>{goalThree || "Not set yet"}</Text>
              <Text style={styles.summaryText}><Text style={styles.summaryLabel}>Meaning: </Text>{progressMeaning || "Not set yet"}</Text>
            </View>
          </View>

          <View style={styles.sectionPanel}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>2 · CHOOSE YOUR NEXT DIRECTION</Text>
              <TouchableOpacity style={styles.secondaryButton} onPress={levelUpCurrentGoals}>
                <Text style={styles.secondaryButtonText}>MAKE STRONGER</Text>
              </TouchableOpacity>
            </View>

            <DirectionCard
              id="recovery"
              title="Recovery Direction"
              text="Sleep, journaling, small steps, stability."
              onPress={setRecoveryExample}
            />
            <DirectionCard
              id="connection"
              title="Connection Direction"
              text="Friends, confidence, social growth."
              onPress={setConnectionExample}
            />
            <DirectionCard
              id="future"
              title="Future Direction"
              text="Money, skills, projects, career direction."
              onPress={setFutureExample}
            />
          </View>

          {chapterNote ? (
            <View style={styles.notePanel}>
              <Text style={styles.noteTitle}>EVIE NOTE</Text>
              <Text style={styles.noteText}>{chapterNote}</Text>
            </View>
          ) : null}

          <View style={styles.sectionPanel}>
            <Text style={styles.sectionTitle}>3 · EDIT YOUR NEXT PATH</Text>

            <Text style={styles.label}>LONG-TERM DREAM</Text>
            <TextInput
              style={styles.textArea}
              multiline
              value={longTermDream}
              onChangeText={setLongTermDream}
              placeholder="Example: Build a stable life with strong health, focus, and income."
              placeholderTextColor="#8A5D2B"
            />

            <Text style={styles.label}>CATEGORY</Text>
            <TextInput
              style={styles.input}
              value={dreamCategory}
              onChangeText={setDreamCategory}
              placeholder="Example: School / Work"
              placeholderTextColor="#8A5D2B"
            />

            <Text style={styles.label}>WHAT DOES PROGRESS MEAN NOW?</Text>
            <TextInput
              style={styles.textArea}
              multiline
              value={progressMeaning}
              onChangeText={setProgressMeaning}
              placeholder="Example: Progress means making more friends, sleeping better, or building money skills."
              placeholderTextColor="#8A5D2B"
            />

            <Text style={styles.label}>SHORT-TERM DIRECTION</Text>
            <TextInput
              style={styles.input}
              value={goalOne}
              onChangeText={setGoalOne}
              placeholder="Example: make money"
              placeholderTextColor="#8A5D2B"
            />

            <Text style={styles.label}>MID-TERM DIRECTION</Text>
            <TextInput
              style={styles.input}
              value={goalTwo}
              onChangeText={setGoalTwo}
              placeholder="Example: build a useful skill"
              placeholderTextColor="#8A5D2B"
            />

            <Text style={styles.label}>LONG-TERM DIRECTION</Text>
            <TextInput
              style={styles.input}
              value={goalThree}
              onChangeText={setGoalThree}
              placeholder="Example: start a project"
              placeholderTextColor="#8A5D2B"
            />

            <TouchableOpacity style={styles.saveButton} onPress={saveNextChapter}>
              <Text style={styles.saveButtonText}>SAVE NEXT CHAPTER</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.reminderPanel}>
            <Text style={styles.reminderTitle}>REMINDER</Text>
            <Text style={styles.reminderText}>
              A new chapter does not erase your progress. It means your life, energy, or confidence has changed — and your path can change with it.
            </Text>
          </View>

          <Link href="/" asChild>
            <TouchableOpacity style={styles.homeButton}>
              <Text style={styles.homeButtonText}>Back to Today</Text>
            </TouchableOpacity>
          </Link>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: {
    flex: 1,
    backgroundColor: "#0E0703",
    alignItems: "center",
    justifyContent: "center",
  },
  phoneStage: {
    width: "100%",
    maxWidth: MAX_FRAME_WIDTH,
    aspectRatio: APP_FRAME_ASPECT_RATIO,
    alignSelf: "center",
    backgroundColor: "#2A1608",
    overflow: "hidden",
    position: "relative",
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
    paddingTop: 24,
    paddingHorizontal: 36,
    paddingBottom: 28,
  },
  titleBanner: {
    backgroundColor: "rgba(245, 205, 125, 0.86)",
    borderWidth: 2,
    borderColor: "#4B2A0B",
    borderRadius: 5,
    paddingVertical: 9,
    paddingHorizontal: 11,
    marginBottom: 8,
    shadowColor: "#2B1403",
    shadowOpacity: 0.55,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 },
  },
  kicker: {
    color: "#14532D",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 2,
  },
  title: {
    color: "#2A1707",
    fontFamily: pixelFont,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  subtitle: {
    color: "#2A1707",
    fontFamily: readableFont,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 3,
  },
  eviePanel: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(24, 80, 34, 0.95)",
    borderWidth: 3,
    borderColor: "#8B5E16",
    borderRadius: 7,
    paddingVertical: 7,
    paddingHorizontal: 8,
    marginBottom: 7,
  },
  evieImage: {
    width: 54,
    height: 54,
    marginRight: 10,
  },
  evieText: {
    flex: 1,
    color: "#FFF8E6",
    fontFamily: readableFont,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
  },
  evieName: {
    color: "#9BE331",
    fontWeight: "900",
    fontSize: 15,
  },
  sectionPanel: {
    backgroundColor: "rgba(250, 220, 157, 0.87)",
    borderWidth: 2,
    borderColor: "#4B2A0B",
    borderRadius: 5,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 7,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  },
  sectionTitle: {
    color: "#2A1707",
    fontFamily: pixelFont,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  summaryGrid: {
    gap: 3,
  },
  summaryText: {
    color: "#2A1707",
    fontFamily: readableFont,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
  },
  summaryLabel: {
    color: "#14532D",
    fontWeight: "900",
  },
  directionCard: {
    backgroundColor: "rgba(255, 239, 197, 0.84)",
    borderWidth: 2,
    borderColor: "#A46B1C",
    borderRadius: 5,
    paddingVertical: 8,
    paddingHorizontal: 9,
    marginBottom: 6,
    shadowColor: "#2B1403",
    shadowOpacity: 0.25,
    shadowRadius: 0,
    shadowOffset: { width: 2, height: 2 },
  },
  directionCardSelected: {
    backgroundColor: "rgba(218, 247, 166, 0.86)",
    borderColor: "#166534",
  },
  directionTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  directionTitle: {
    color: "#2A1707",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
  },
  directionTitleSelected: {
    color: "#0F3D18",
  },
  directionArrow: {
    color: "#166534",
    fontFamily: pixelFont,
    fontSize: 18,
    fontWeight: "900",
  },
  directionText: {
    color: "#3D2408",
    fontFamily: readableFont,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 16,
    marginTop: 2,
  },
  secondaryButton: {
    backgroundColor: "#12321B",
    borderWidth: 2,
    borderColor: "#D99A16",
    borderRadius: 5,
    paddingVertical: 6,
    paddingHorizontal: 8,
    shadowColor: "#2B1403",
    shadowOpacity: 0.35,
    shadowRadius: 0,
    shadowOffset: { width: 2, height: 2 },
  },
  secondaryButtonText: {
    color: "#FFF8E6",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "900",
  },
  notePanel: {
    backgroundColor: "rgba(255, 239, 197, 0.88)",
    borderWidth: 2,
    borderColor: "#D99A16",
    borderRadius: 5,
    padding: 9,
    marginBottom: 7,
  },
  noteTitle: {
    color: "#14532D",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 3,
  },
  noteText: {
    color: "#2A1707",
    fontFamily: readableFont,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
  },
  label: {
    color: "#2A1707",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginTop: 6,
    marginBottom: 3,
  },
  input: {
    minHeight: 38,
    backgroundColor: "rgba(255, 242, 201, 0.94)",
    borderWidth: 2,
    borderColor: "#6F4312",
    borderRadius: 3,
    color: "#1F1306",
    fontFamily: readableFont,
    fontSize: 15,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  textArea: {
    minHeight: 62,
    backgroundColor: "rgba(255, 242, 201, 0.94)",
    borderWidth: 2,
    borderColor: "#6F4312",
    borderRadius: 3,
    color: "#1F1306",
    fontFamily: readableFont,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 19,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlignVertical: "top",
  },
  saveButton: {
    minHeight: 54,
    backgroundColor: "#14532D",
    borderWidth: 4,
    borderColor: "#F3B32B",
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    shadowColor: "#2B1403",
    shadowOpacity: 0.65,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  saveButtonText: {
    color: "#FFF8E6",
    fontFamily: pixelFont,
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: 1,
    textShadowColor: "#1B0C01",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  reminderPanel: {
    backgroundColor: "rgba(250, 220, 157, 0.82)",
    borderWidth: 2,
    borderColor: "#A46B1C",
    borderRadius: 5,
    padding: 9,
    marginBottom: 8,
  },
  reminderTitle: {
    color: "#14532D",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 4,
  },
  reminderText: {
    color: "#2A1707",
    fontFamily: readableFont,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
  },
  homeButton: {
    alignSelf: "center",
    minWidth: 150,
    backgroundColor: "rgba(42, 23, 7, 0.88)",
    borderWidth: 2,
    borderColor: "#A46B1C",
    borderRadius: 5,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  homeButtonText: {
    color: "#FFF8E6",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
  },
});