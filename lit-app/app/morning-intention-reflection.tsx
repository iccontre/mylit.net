import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
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

type MorningIntentionReflection = {
  id: string;
  intentionId: string;
  date: string;
  recallType: string;
  reflectionText: string;
  todayAction: string;
  createdAt: string;
};

const LATEST_PRE_SLEEP_INTENTION_KEY = "lit_latest_pre_sleep_intention";
const MORNING_INTENTION_REFLECTIONS_KEY = "lit_morning_intention_reflections";
const TOMORROW_QUEUE_KEY = "lit_tomorrow_queue";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

function getTodayKey() {
  return new Date().toLocaleDateString("en-CA");
}

export default function MorningIntentionReflectionScreen() {
  const router = useRouter();

  const [latestIntention, setLatestIntention] = useState<PreSleepIntention | null>(null);
  const [recallType, setRecallType] = useState("I do not remember");
  const [reflectionText, setReflectionText] = useState("");
  const [todayAction, setTodayAction] = useState("");

  const recallOptions = [
    "In a dream",
    "In my thoughts",
    "I felt more focused",
    "Not really",
    "I do not remember",
  ];

  useEffect(() => {
    loadLatestIntention();
  }, []);

  async function loadLatestIntention() {
    const saved = await AsyncStorage.getItem(LATEST_PRE_SLEEP_INTENTION_KEY);

    if (saved) {
      const parsed: PreSleepIntention = JSON.parse(saved);
      setLatestIntention(parsed);
      setTodayAction("");
    }
  }

  async function successHaptic() {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Haptics may not run in web preview.
    }
  }

  async function saveReflection() {
    if (!latestIntention) return;

    const reflection: MorningIntentionReflection = {
      id: String(Date.now()),
      intentionId: latestIntention.id,
      date: getTodayKey(),
      recallType,
      reflectionText: reflectionText.trim(),
      todayAction: todayAction.trim(),
      createdAt: new Date().toISOString(),
    };

    const saved = await AsyncStorage.getItem(MORNING_INTENTION_REFLECTIONS_KEY);
    const history: MorningIntentionReflection[] = saved ? JSON.parse(saved) : [];
    const nextHistory = [reflection, ...history];

    await AsyncStorage.setItem(MORNING_INTENTION_REFLECTIONS_KEY, JSON.stringify(nextHistory));

    if (todayAction.trim()) {
      const savedQueue = await AsyncStorage.getItem(TOMORROW_QUEUE_KEY);
      const queue = savedQueue ? JSON.parse(savedQueue) : [];

      const suggestedAction = {
        text: todayAction.trim(),
        type: "Intention Action",
      };

      await AsyncStorage.setItem(
        TOMORROW_QUEUE_KEY,
        JSON.stringify([suggestedAction, ...queue])
      );
    }

    await successHaptic();

    router.push("/");
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.shell}>
      <View style={styles.hero}>
        <Text style={styles.heroKicker}>SUNRISE HUD</Text>
        <Text style={styles.title}>MORNING REFLECTION</Text>
        <Text style={styles.subtitle}>Review the signal from last night.</Text>
      </View>

      {!latestIntention ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>NO SIGNAL SAVED</Text>
          <Text style={styles.emptyText}>
            Set a pre-sleep intention tonight, then return here tomorrow morning.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push("/pre-sleep-intention")}>
            <Text style={styles.primaryButtonText}>Set Pre-Sleep Intention</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.signalCard}>
            <Text style={styles.sectionTitle}>LAST NIGHT’S SIGNAL</Text>
            <Text style={styles.intentionText}>{latestIntention.intention}</Text>

            {latestIntention.whyItMatters ? (
              <Text style={styles.supportingText}>Why it matters: {latestIntention.whyItMatters}</Text>
            ) : null}

            {latestIntention.firstSmallAction ? (
              <Text style={styles.supportingText}>First small action: {latestIntention.firstSmallAction}</Text>
            ) : null}

            {latestIntention.dreamSymbol ? (
              <Text style={styles.supportingText}>Dream symbol: {latestIntention.dreamSymbol}</Text>
            ) : null}
          </View>

          <View style={styles.panel}>
            <Text style={styles.label}>
              Did this show up in your thoughts, dreams, mood, or motivation?
            </Text>

            <View style={styles.optionWrap}>
              {recallOptions.map((option) => {
                const isSelected = recallType === option;

                return (
                  <TouchableOpacity
                    key={option}
                    style={isSelected ? styles.optionSelected : styles.option}
                    onPress={() => setRecallType(option)}
                  >
                    <Text style={isSelected ? styles.optionSelectedText : styles.optionText}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Reflection</Text>
            <TextInput
              style={styles.textArea}
              multiline
              placeholder="Write what you noticed this morning."
              placeholderTextColor="#94A3B8"
              value={reflectionText}
              onChangeText={setReflectionText}
            />
          </View>

          <View style={styles.panel}>
            <Text style={styles.label}>
              What is one small action you can take today based on this intention?
            </Text>

            {latestIntention.firstSmallAction ? (
              <View style={styles.suggestionBox}>
                <Text style={styles.suggestionLabel}>Suggested action</Text>
                <Text style={styles.suggestionText}>{latestIntention.firstSmallAction}</Text>
                <TouchableOpacity
                  style={styles.useSuggestionButton}
                  onPress={() => setTodayAction(latestIntention.firstSmallAction)}
                >
                  <Text style={styles.useSuggestionButtonText}>Use This Action</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <TextInput
              style={styles.textArea}
              multiline
              placeholder="Write one small action for today."
              placeholderTextColor="#94A3B8"
              value={todayAction}
              onChangeText={setTodayAction}
            />

            <Text style={styles.helperText}>
              Saving this will also add the action to your Tomorrow Queue as an Intention Action.
            </Text>
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={saveReflection}>
            <Text style={styles.saveButtonText}>Save Reflection</Text>
          </TouchableOpacity>
        </>
      )}

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
    backgroundColor: "#111827",
    borderColor: "#FBBF24",
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
    color: "#FDE68A",
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
  emptyCard: {
    backgroundColor: "#111827",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  emptyTitle: {
    fontFamily: pixelFont,
    fontSize: 17,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 8,
    letterSpacing: 0.8,
  },
  emptyText: {
    fontFamily: pixelFont,
    fontSize: 13,
    lineHeight: 19,
    color: "#CBD5E1",
    fontWeight: "700",
    marginBottom: 14,
  },
  primaryButton: {
    backgroundColor: "#312E81",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  primaryButtonText: {
    color: "#F9FAFB",
    fontSize: 13,
    fontWeight: "900",
    fontFamily: pixelFont,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  signalCard: {
    backgroundColor: "#1A1F38",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: "#FBBF24",
  },
  sectionTitle: {
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    color: "#FDE68A",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  intentionText: {
    fontFamily: pixelFont,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 8,
  },
  supportingText: {
    fontFamily: pixelFont,
    fontSize: 12,
    lineHeight: 18,
    color: "#CBD5E1",
    fontWeight: "700",
    marginTop: 4,
  },
  panel: {
    backgroundColor: "#0F172A",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#475569",
  },
  label: {
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    color: "#E5E7EB",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    lineHeight: 16,
  },
  optionWrap: {
    marginBottom: 8,
  },
  option: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 11,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "#334155",
  },
  optionSelected: {
    backgroundColor: "#312E81",
    borderRadius: 12,
    padding: 11,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  optionText: {
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "800",
    color: "#E5E7EB",
  },
  optionSelectedText: {
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    color: "#F9FAFB",
  },
  textArea: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 12,
    minHeight: 88,
    fontSize: 15,
    color: "#F9FAFB",
    marginBottom: 8,
    textAlignVertical: "top",
    borderWidth: 2,
    borderColor: "#A78BFA",
    fontFamily: pixelFont,
  },
  suggestionBox: {
    backgroundColor: "#1E1B4B",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  suggestionLabel: {
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    color: "#C4B5FD",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  suggestionText: {
    fontFamily: pixelFont,
    fontSize: 13,
    lineHeight: 19,
    color: "#F9FAFB",
    fontWeight: "800",
    marginBottom: 10,
  },
  useSuggestionButton: {
    backgroundColor: "#FBBF24",
    padding: 10,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#111827",
  },
  useSuggestionButtonText: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "900",
    fontFamily: pixelFont,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  helperText: {
    fontFamily: pixelFont,
    fontSize: 11,
    lineHeight: 16,
    color: "#94A3B8",
    fontWeight: "700",
    marginTop: 2,
  },
  saveButton: {
    backgroundColor: "#FBBF24",
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#111827",
    marginBottom: 12,
  },
  saveButtonText: {
    color: "#111827",
    fontSize: 14,
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
    fontSize: 13,
    fontWeight: "900",
    fontFamily: pixelFont,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
});