import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
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
      setTodayAction(parsed.firstSmallAction || "");
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroIcon}>☀️</Text>
        <Text style={styles.title}>Morning Reflection</Text>
        <Text style={styles.subtitle}>
          Notice whether last night’s intention affected your thoughts, dreams, mood, or motivation.
        </Text>
      </View>

      {!latestIntention ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No intention saved yet</Text>
          <Text style={styles.emptyText}>
            Set a pre-sleep intention tonight, then return here tomorrow morning to reflect.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push("/pre-sleep-intention")}>
            <Text style={styles.primaryButtonText}>Set Pre-Sleep Intention</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.intentionCard}>
            <Text style={styles.cardLabel}>Last night’s intention</Text>
            <Text style={styles.intentionText}>{latestIntention.intention}</Text>

            {latestIntention.whyItMatters ? (
              <Text style={styles.supportingText}>Why it matters: {latestIntention.whyItMatters}</Text>
            ) : null}

            {latestIntention.dreamSymbol ? (
              <Text style={styles.supportingText}>Dream symbol: {latestIntention.dreamSymbol}</Text>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>
              Did this show up in your thoughts, dreams, mood, or motivation this morning?
            </Text>

            {recallOptions.map((option) => {
              const isSelected = recallType === option;

              return (
                <TouchableOpacity
                  key={option}
                  style={isSelected ? styles.selectedOption : styles.option}
                  onPress={() => setRecallType(option)}
                >
                  <Text style={isSelected ? styles.selectedOptionText : styles.optionText}>
                    {isSelected ? "✓ " : ""}{option}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <Text style={styles.label}>Short reflection</Text>
            <TextInput
              style={styles.textArea}
              multiline
              placeholder="Example: I did not dream about it, but I woke up remembering that I wanted to start small."
              placeholderTextColor="#9CA3AF"
              value={reflectionText}
              onChangeText={setReflectionText}
            />

            <Text style={styles.label}>
              What is one small action you can take today based on this intention?
            </Text>
            <TextInput
              style={styles.textArea}
              multiline
              placeholder="Example: Work on the assignment for 10 minutes."
              placeholderTextColor="#9CA3AF"
              value={todayAction}
              onChangeText={setTodayAction}
            />

            <Text style={styles.helperText}>
              Saving this will also add the action to your Tomorrow Queue as an Intention Action.
            </Text>

            <TouchableOpacity style={styles.saveButton} onPress={saveReflection}>
              <Text style={styles.saveButtonText}>Save Morning Reflection</Text>
            </TouchableOpacity>
          </View>
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
    backgroundColor: "#F7EBC8",
  },
  container: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  hero: {
    backgroundColor: "#FDE68A",
    borderColor: "#F59E0B",
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
    color: "#FFFFFF",
    fontWeight: "800",
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#E5D39A",
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#374151",
    fontWeight: "600",
    marginBottom: 16,
  },
  intentionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#F59E0B",
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: "900",
    color: "#6B7280",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  intentionText: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 10,
  },
  supportingText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#374151",
    fontWeight: "700",
    marginTop: 6,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#E5D39A",
  },
  label: {
    fontSize: 14,
    fontWeight: "900",
    color: "#374151",
    marginBottom: 10,
    marginTop: 12,
    textTransform: "uppercase",
  },
  option: {
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  selectedOption: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  optionText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#374151",
  },
  selectedOptionText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  textArea: {
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    padding: 14,
    minHeight: 100,
    fontSize: 16,
    color: "#111827",
    marginBottom: 8,
    textAlignVertical: "top",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  helperText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#6B7280",
    fontWeight: "700",
    marginTop: 4,
    marginBottom: 14,
  },
  saveButton: {
    backgroundColor: "#111827",
    padding: 18,
    borderRadius: 20,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FBBF24",
    marginTop: 12,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
  },
  primaryButton: {
    backgroundColor: "#111827",
    padding: 16,
    borderRadius: 18,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  backButton: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 20,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#D1D5DB",
  },
  backButtonText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "900",
  },
});
