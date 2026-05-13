import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

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
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroIcon}>🌙</Text>
        <Text style={styles.title}>Pre-Sleep Intention</Text>
        <Text style={styles.subtitle}>
          Give your mind gentle direction before sleep. Set one clear intention for tomorrow.
        </Text>
      </View>

      <View style={styles.lunaCard}>
        <Text style={styles.lunaName}>🌙 Luna</Text>
        <Text style={styles.lunaText}>
          This is not about forcing a dream or guaranteeing an outcome. It is a quiet way
          to prepare for tomorrow and notice what your mind carries into the morning.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>What is one thing you want to prioritize tomorrow?</Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Example: I want to focus on finishing my assignment."
          placeholderTextColor="#9CA3AF"
          value={intention}
          onChangeText={setIntention}
        />

        <Text style={styles.label}>Why does this matter to you?</Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Example: It helps me feel less behind and more confident."
          placeholderTextColor="#9CA3AF"
          value={whyItMatters}
          onChangeText={setWhyItMatters}
        />

        <Text style={styles.label}>What is the first small action you can take tomorrow?</Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Example: Open the document and write for 10 minutes."
          placeholderTextColor="#9CA3AF"
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
          placeholderTextColor="#9CA3AF"
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
    backgroundColor: "#0F172A",
  },
  container: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  hero: {
    backgroundColor: "#1E1B4B",
    borderColor: "#A78BFA",
    borderWidth: 3,
    borderRadius: 34,
    padding: 22,
    marginBottom: 18,
  },
  heroIcon: {
    fontSize: 42,
    marginBottom: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: "900",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: "#E5E7EB",
    fontWeight: "700",
  },
  lunaCard: {
    backgroundColor: "#EEF2FF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#A78BFA",
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
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  label: {
    fontSize: 14,
    fontWeight: "900",
    color: "#374151",
    marginBottom: 10,
    marginTop: 12,
    textTransform: "uppercase",
  },
  textArea: {
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    padding: 14,
    minHeight: 90,
    fontSize: 16,
    color: "#111827",
    marginBottom: 8,
    textAlignVertical: "top",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  saveButton: {
    backgroundColor: "#312E81",
    padding: 18,
    borderRadius: 20,
    alignItems: "center",
    marginTop: 16,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
  },
  backButton: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 20,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  backButtonText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "900",
  },
});
