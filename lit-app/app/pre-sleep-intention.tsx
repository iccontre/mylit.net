import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type PreSleepIntention = {
  id: string;
  date: string;
  intention: string;
  whyItMatters: string;
  firstSmallAction: string;
  dreamSymbol: string;
  createdAt: string;
};

const PRE_SLEEP_INTENTIONS_KEY = "lit_pre_sleep_intentions";
const LATEST_PRE_SLEEP_INTENTION_KEY = "lit_latest_pre_sleep_intention";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

function getTodayKey() {
  return new Date().toLocaleDateString("en-CA");
}

export default function PreSleepIntentionScreen() {
  const router = useRouter();

  const [intention, setIntention] = useState("");
  const [whyItMatters, setWhyItMatters] = useState("");
  const [firstSmallAction, setFirstSmallAction] = useState("");
  const [dreamSymbol, setDreamSymbol] = useState("");

  async function successHaptic() {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Haptics may not run in web preview.
    }
  }

  async function saveIntention() {
    if (!intention.trim()) return;

    const entry: PreSleepIntention = {
      id: String(Date.now()),
      date: getTodayKey(),
      intention: intention.trim(),
      whyItMatters: whyItMatters.trim(),
      firstSmallAction: firstSmallAction.trim(),
      dreamSymbol: dreamSymbol.trim(),
      createdAt: new Date().toISOString(),
    };

    const saved = await AsyncStorage.getItem(PRE_SLEEP_INTENTIONS_KEY);
    const history: PreSleepIntention[] = saved ? JSON.parse(saved) : [];

    const nextHistory = [entry, ...history];

    await AsyncStorage.setItem(PRE_SLEEP_INTENTIONS_KEY, JSON.stringify(nextHistory));
    await AsyncStorage.setItem(LATEST_PRE_SLEEP_INTENTION_KEY, JSON.stringify(entry));

    await successHaptic();

    router.push("/");
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.shell}>
      <View style={styles.hero}>
        <Text style={styles.heroKicker}>NIGHT HUD</Text>
        <Text style={styles.title}>PRE-SLEEP INTENTION</Text>
        <Text style={styles.subtitle}>Set one signal for tomorrow.</Text>
      </View>

      <View style={styles.lunaCard}>
        <Text style={styles.lunaName}>Luna</Text>
        <Text style={styles.lunaText}>
          This is not about forcing a dream. Set one clear direction and notice what carries into morning.
        </Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.label}>What is one thing you want to prioritize tomorrow?</Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Example: I want to focus on finishing my assignment."
          placeholderTextColor="#94A3B8"
          value={intention}
          onChangeText={setIntention}
        />

        <Text style={styles.label}>Why does this matter to you?</Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Example: It helps me feel less behind and more confident."
          placeholderTextColor="#94A3B8"
          value={whyItMatters}
          onChangeText={setWhyItMatters}
        />

        <Text style={styles.label}>What is the first small action you can take tomorrow?</Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Example: Open the document and write for 10 minutes."
          placeholderTextColor="#94A3B8"
          value={firstSmallAction}
          onChangeText={setFirstSmallAction}
        />

        <Text style={styles.label}>
          If this showed up in a dream, what image, symbol, or scene might represent it?
        </Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Example: A sunrise, a locked door opening, a desk, a path, a mountain."
          placeholderTextColor="#94A3B8"
          value={dreamSymbol}
          onChangeText={setDreamSymbol}
        />

        <TouchableOpacity style={styles.saveButton} onPress={saveIntention}>
          <Text style={styles.saveButtonText}>Save Intention</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.backButton} onPress={() => router.push("/")}>
        <Text style={styles.backButtonText}>Back to Today</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0B1020",
  },
  shell: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    padding: 18,
    paddingTop: 56,
    paddingBottom: 36,
  },
  hero: {
    backgroundColor: "#1E1B4B",
    borderColor: "#A78BFA",
    borderWidth: 3,
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
  },
  heroKicker: {
    fontFamily: pixelFont,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "900",
    color: "#C4B5FD",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: pixelFont,
    fontSize: 28,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 6,
    lineHeight: 34,
  },
  subtitle: {
    fontFamily: pixelFont,
    fontSize: 13,
    lineHeight: 19,
    color: "#E5E7EB",
    fontWeight: "700",
  },
  lunaCard: {
    backgroundColor: "#111827",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  lunaName: {
    fontFamily: pixelFont,
    fontSize: 16,
    fontWeight: "900",
    color: "#E9D5FF",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  lunaText: {
    fontFamily: pixelFont,
    fontSize: 13,
    lineHeight: 19,
    color: "#F3F4F6",
    fontWeight: "700",
  },
  formCard: {
    backgroundColor: "#0F172A",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: "#FBBF24",
  },
  label: {
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    color: "#E5E7EB",
    marginBottom: 8,
    marginTop: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    lineHeight: 16,
  },
  textArea: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 12,
    minHeight: 84,
    fontSize: 15,
    color: "#F9FAFB",
    marginBottom: 6,
    textAlignVertical: "top",
    borderWidth: 2,
    borderColor: "#475569",
    fontFamily: pixelFont,
  },
  saveButton: {
    backgroundColor: "#312E81",
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 14,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  saveButtonText: {
    color: "#F9FAFB",
    fontSize: 15,
    fontWeight: "900",
    fontFamily: pixelFont,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  backButton: {
    backgroundColor: "#111827",
    padding: 13,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  backButtonText: {
    color: "#F9FAFB",
    fontSize: 14,
    fontWeight: "900",
    fontFamily: pixelFont,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
});