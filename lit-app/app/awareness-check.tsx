import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type AwarenessCheck = {
  id: string;
  attentionFocus: string;
  automaticOrIntentional: "Mostly automatic" | "Mixed" | "Mostly intentional";
  pulledAway: string;
  broughtBack: string;
  presentMoment: string;
  createdAt: string;
};

const AWARENESS_CHECKS_KEY = "lit_awareness_checks";

export default function AwarenessCheckScreen() {
  const router = useRouter();

  const [attentionFocus, setAttentionFocus] = useState("");
  const [automaticOrIntentional, setAutomaticOrIntentional] =
    useState<"Mostly automatic" | "Mixed" | "Mostly intentional">("Mixed");
  const [pulledAway, setPulledAway] = useState("");
  const [broughtBack, setBroughtBack] = useState("");
  const [presentMoment, setPresentMoment] = useState("");
  const [checks, setChecks] = useState<AwarenessCheck[]>([]);

  useEffect(() => {
    loadChecks();
  }, []);

  async function loadChecks() {
    const saved = await AsyncStorage.getItem(AWARENESS_CHECKS_KEY);

    if (saved) {
      setChecks(JSON.parse(saved));
    }
  }

  async function successHaptic() {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Haptics may not run in web preview.
    }
  }

  async function saveAwarenessCheck() {
    const hasEntry =
      attentionFocus.trim() ||
      pulledAway.trim() ||
      broughtBack.trim() ||
      presentMoment.trim();

    if (!hasEntry) return;

    const newCheck: AwarenessCheck = {
      id: String(Date.now()),
      attentionFocus: attentionFocus.trim(),
      automaticOrIntentional,
      pulledAway: pulledAway.trim(),
      broughtBack: broughtBack.trim(),
      presentMoment: presentMoment.trim(),
      createdAt: new Date().toLocaleString(),
    };

    const nextChecks = [newCheck, ...checks];

    setChecks(nextChecks);
    await AsyncStorage.setItem(AWARENESS_CHECKS_KEY, JSON.stringify(nextChecks));

    setAttentionFocus("");
    setAutomaticOrIntentional("Mixed");
    setPulledAway("");
    setBroughtBack("");
    setPresentMoment("");

    await successHaptic();
  }

  async function clearChecks() {
    setChecks([]);
    await AsyncStorage.setItem(AWARENESS_CHECKS_KEY, JSON.stringify([]));
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroIcon}>🧠</Text>
        <Text style={styles.title}>Awareness Check</Text>
        <Text style={styles.subtitle}>
          Notice where your attention went today. This is about awareness, not judgment.
        </Text>
      </View>

      <View style={styles.lunaCard}>
        <Text style={styles.lunaName}>🌙 Luna</Text>
        <Text style={styles.lunaText}>
          Some days we move through life automatically. This check-in helps you notice
          what pulled you away, what brought you back, and when you felt present.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Where was your attention most of the day?</Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Example: school, work, my phone, anxiety, friends, a goal, or just getting through the day."
          placeholderTextColor="#9CA3AF"
          value={attentionFocus}
          onChangeText={setAttentionFocus}
        />

        <Text style={styles.label}>Were you acting automatically or intentionally?</Text>

        <TouchableOpacity
          style={
            automaticOrIntentional === "Mostly automatic"
              ? styles.selectedOption
              : styles.option
          }
          onPress={() => setAutomaticOrIntentional("Mostly automatic")}
        >
          <Text
            style={
              automaticOrIntentional === "Mostly automatic"
                ? styles.selectedOptionText
                : styles.optionText
            }
          >
            {automaticOrIntentional === "Mostly automatic" ? "✓ " : ""}Mostly automatic
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={automaticOrIntentional === "Mixed" ? styles.selectedOption : styles.option}
          onPress={() => setAutomaticOrIntentional("Mixed")}
        >
          <Text
            style={
              automaticOrIntentional === "Mixed"
                ? styles.selectedOptionText
                : styles.optionText
            }
          >
            {automaticOrIntentional === "Mixed" ? "✓ " : ""}Mixed
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={
            automaticOrIntentional === "Mostly intentional"
              ? styles.selectedOption
              : styles.option
          }
          onPress={() => setAutomaticOrIntentional("Mostly intentional")}
        >
          <Text
            style={
              automaticOrIntentional === "Mostly intentional"
                ? styles.selectedOptionText
                : styles.optionText
            }
          >
            {automaticOrIntentional === "Mostly intentional" ? "✓ " : ""}Mostly intentional
          </Text>
        </TouchableOpacity>

        <Text style={styles.label}>What pulled you away from your goals?</Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Example: scrolling, stress, tiredness, comparison, overthinking, or not knowing where to start."
          placeholderTextColor="#9CA3AF"
          value={pulledAway}
          onChangeText={setPulledAway}
        />

        <Text style={styles.label}>What brought you back?</Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Example: a reminder, a person, music, journaling, a walk, or one small task."
          placeholderTextColor="#9CA3AF"
          value={broughtBack}
          onChangeText={setBroughtBack}
        />

        <Text style={styles.label}>What is one moment where you felt present?</Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Example: eating, walking outside, talking to someone, working quietly, or resting."
          placeholderTextColor="#9CA3AF"
          value={presentMoment}
          onChangeText={setPresentMoment}
        />

        <TouchableOpacity style={styles.saveButton} onPress={saveAwarenessCheck}>
          <Text style={styles.saveButtonText}>Save Awareness Check</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Recent Awareness Checks</Text>

      {checks.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            No awareness checks yet. Start with one honest observation.
          </Text>
        </View>
      ) : (
        checks.map((check) => (
          <View key={check.id} style={styles.entryCard}>
            <Text style={styles.entryTitle}>{check.automaticOrIntentional}</Text>
            <Text style={styles.entryDate}>{check.createdAt}</Text>

            {check.attentionFocus ? (
              <Text style={styles.entryText}>Attention: {check.attentionFocus}</Text>
            ) : null}

            {check.pulledAway ? (
              <Text style={styles.entryText}>Pulled away by: {check.pulledAway}</Text>
            ) : null}

            {check.broughtBack ? (
              <Text style={styles.entryText}>Brought back by: {check.broughtBack}</Text>
            ) : null}

            {check.presentMoment ? (
              <Text style={styles.presentText}>Present moment: {check.presentMoment}</Text>
            ) : null}
          </View>
        ))
      )}

      {checks.length > 0 && (
        <TouchableOpacity style={styles.clearButton} onPress={clearChecks}>
          <Text style={styles.clearButtonText}>Clear Awareness Checks</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.homeButton} onPress={() => router.push("/")}>
        <Text style={styles.homeButtonText}>Back to Today</Text>
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
    minHeight: 95,
    fontSize: 16,
    color: "#111827",
    marginBottom: 8,
    textAlignVertical: "top",
    borderWidth: 2,
    borderColor: "#E5E7EB",
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
  saveButton: {
    backgroundColor: "#111827",
    padding: 18,
    borderRadius: 20,
    alignItems: "center",
    marginTop: 16,
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 14,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    lineHeight: 23,
    color: "#6B7280",
  },
  entryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#D1D5DB",
  },
  entryTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
  },
  entryDate: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 4,
    marginBottom: 8,
  },
  entryText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#374151",
    fontWeight: "700",
    marginBottom: 6,
  },
  presentText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#166534",
    fontWeight: "800",
    marginTop: 4,
  },
  clearButton: {
    backgroundColor: "#FEE2E2",
    padding: 16,
    borderRadius: 18,
    alignItems: "center",
    marginTop: 8,
  },
  clearButtonText: {
    color: "#991B1B",
    fontSize: 16,
    fontWeight: "900",
  },
  homeButton: {
    backgroundColor: "#FBBF24",
    padding: 18,
    borderRadius: 20,
    alignItems: "center",
    marginTop: 12,
    borderWidth: 2,
    borderColor: "#111827",
  },
  homeButtonText: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900",
  },
});
