import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
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

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

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
      <View style={styles.shell}>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>ATTENTION PRACTICE</Text>
          <Text style={styles.title}>MEDITATIONS</Text>
          <Text style={styles.subtitle}>Notice attention. Come back gently.</Text>
        </View>

        <View style={styles.lunaCard}>
          <Text style={styles.lunaName}>Luna</Text>
          <Text style={styles.lunaText}>
            Write what had your focus, what pulled you away, and what helped you come back.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Where was your attention most of the day?</Text>
          <TextInput
            style={styles.textArea}
            multiline
            placeholder="Example: school, work, my phone, anxiety, friends, a goal, or just getting through the day."
            placeholderTextColor="#94A3B8"
            value={attentionFocus}
            onChangeText={setAttentionFocus}
          />

          <Text style={styles.label}>Were you moving automatically or with intention?</Text>

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

          <Text style={styles.label}>What pulled you away?</Text>
          <TextInput
            style={styles.textArea}
            multiline
            placeholder="Example: scrolling, stress, tiredness, comparison, overthinking, or not knowing where to start."
            placeholderTextColor="#94A3B8"
            value={pulledAway}
            onChangeText={setPulledAway}
          />

          <Text style={styles.label}>What brought you back?</Text>
          <TextInput
            style={styles.textArea}
            multiline
            placeholder="Example: a reminder, a person, music, journaling, a walk, or one small task."
            placeholderTextColor="#94A3B8"
            value={broughtBack}
            onChangeText={setBroughtBack}
          />

          <Text style={styles.label}>When did you feel most present?</Text>
          <TextInput
            style={styles.textArea}
            multiline
            placeholder="Example: eating, walking outside, talking to someone, working quietly, or resting."
            placeholderTextColor="#94A3B8"
            value={presentMoment}
            onChangeText={setPresentMoment}
          />

          <TouchableOpacity style={styles.saveButton} onPress={saveAwarenessCheck}>
            <Text style={styles.saveButtonText}>Save Meditation</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>RECENT MEDITATIONS</Text>

        {checks.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              No meditations yet. Start with one honest observation.
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
                <Text style={styles.entryText}>Pulled away: {check.pulledAway}</Text>
              ) : null}

              {check.broughtBack ? (
                <Text style={styles.entryText}>Brought back: {check.broughtBack}</Text>
              ) : null}

              {check.presentMoment ? (
                <Text style={styles.presentText}>Present moment: {check.presentMoment}</Text>
              ) : null}
            </View>
          ))
        )}

        {checks.length > 0 && (
          <TouchableOpacity style={styles.clearButton} onPress={clearChecks}>
            <Text style={styles.clearButtonText}>Clear Meditations</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.homeButton} onPress={() => router.push("/")}>
          <Text style={styles.homeButtonText}>Back to Today</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0B1120",
  },
  container: {
    paddingTop: 32,
    paddingBottom: 36,
  },
  shell: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 18,
  },
  hero: {
    backgroundColor: "#1E1B4B",
    borderColor: "#A78BFA",
    borderWidth: 3,
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
  },
  heroLabel: {
    color: "#C4B5FD",
    fontFamily: pixelFont,
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: "800",
    marginBottom: 8,
  },
  title: {
    fontSize: 30,
    fontFamily: pixelFont,
    letterSpacing: 1.2,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: "#DDD6FE",
    fontFamily: pixelFont,
    fontWeight: "700",
  },
  lunaCard: {
    backgroundColor: "#2E1065",
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: "#C4B5FD",
  },
  lunaName: {
    fontSize: 18,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 8,
    fontFamily: pixelFont,
    letterSpacing: 1,
  },
  lunaText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#E5E7EB",
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#111827",
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: "#8B5CF6",
  },
  label: {
    fontSize: 12,
    fontWeight: "900",
    color: "#E9D5FF",
    marginBottom: 8,
    marginTop: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontFamily: pixelFont,
  },
  textArea: {
    backgroundColor: "#020617",
    borderRadius: 16,
    padding: 13,
    minHeight: 88,
    fontSize: 15,
    color: "#F9FAFB",
    marginBottom: 6,
    textAlignVertical: "top",
    borderWidth: 2,
    borderColor: "#475569",
  },
  option: {
    backgroundColor: "#1F2937",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "#475569",
  },
  selectedOption: {
    backgroundColor: "#111827",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  optionText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#E5E7EB",
  },
  selectedOptionText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#F9FAFB",
  },
  saveButton: {
    backgroundColor: "#6D28D9",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 14,
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  saveButtonText: {
    color: "#F9FAFB",
    fontSize: 15,
    fontWeight: "900",
    fontFamily: pixelFont,
    letterSpacing: 0.8,
  },
  sectionTitle: {
    fontSize: 21,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 10,
    fontFamily: pixelFont,
    letterSpacing: 1,
  },
  emptyCard: {
    backgroundColor: "#111827",
    borderRadius: 18,
    padding: 15,
    borderWidth: 2,
    borderColor: "#4B5563",
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#CBD5E1",
  },
  entryCard: {
    backgroundColor: "#0F172A",
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  entryTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#F9FAFB",
    fontFamily: pixelFont,
  },
  entryDate: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 4,
    marginBottom: 8,
    fontFamily: pixelFont,
  },
  entryText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#E5E7EB",
    fontWeight: "700",
    marginBottom: 4,
  },
  presentText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#C4B5FD",
    fontWeight: "800",
    marginTop: 3,
  },
  clearButton: {
    backgroundColor: "#3F1D1D",
    paddingVertical: 13,
    borderRadius: 15,
    alignItems: "center",
    marginTop: 6,
    borderWidth: 2,
    borderColor: "#EF4444",
  },
  clearButtonText: {
    color: "#FCA5A5",
    fontSize: 14,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
  homeButton: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 10,
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  homeButtonText: {
    color: "#F9FAFB",
    fontSize: 15,
    fontWeight: "900",
    fontFamily: pixelFont,
    letterSpacing: 0.8,
  },
});