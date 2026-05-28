import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type AwarenessEntry = {
  id: string;
  date: string;
  attentionFocus: string;
  mode: "Automatic" | "Mixed" | "Intentional";
  pulledAway: string;
  broughtBack: string;
  presentMoment: string;
  createdAt: string;
};

const AWARENESS_KEY = "lit_awareness_checks";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

export default function AwarenessCheckScreen() {
  const router = useRouter();

  const [attentionFocus, setAttentionFocus] = useState("");
  const [mode, setMode] = useState<AwarenessEntry["mode"]>("Mixed");
  const [pulledAway, setPulledAway] = useState("");
  const [broughtBack, setBroughtBack] = useState("");
  const [presentMoment, setPresentMoment] = useState("");
  const [entries, setEntries] = useState<AwarenessEntry[]>([]);

  useEffect(() => {
    loadEntries();
  }, []);

  async function loadEntries() {
    const saved = await AsyncStorage.getItem(AWARENESS_KEY);

    if (!saved) {
      setEntries([]);
      return;
    }

    try {
      const parsed = JSON.parse(saved);
      setEntries(Array.isArray(parsed) ? parsed : []);
    } catch {
      setEntries([]);
    }
  }

  async function saveEntry() {
    const entry: AwarenessEntry = {
      id: String(Date.now()),
      date: new Date().toLocaleDateString(),
      attentionFocus: attentionFocus.trim(),
      mode,
      pulledAway: pulledAway.trim(),
      broughtBack: broughtBack.trim(),
      presentMoment: presentMoment.trim(),
      createdAt: new Date().toISOString(),
    };

    const next = [entry, ...entries];
    setEntries(next);
    await AsyncStorage.setItem(AWARENESS_KEY, JSON.stringify(next));

    setAttentionFocus("");
    setMode("Mixed");
    setPulledAway("");
    setBroughtBack("");
    setPresentMoment("");
  }

  async function clearEntries() {
    await AsyncStorage.removeItem(AWARENESS_KEY);
    setEntries([]);
  }

  const modeOptions: AwarenessEntry["mode"][] = useMemo(
    () => ["Automatic", "Mixed", "Intentional"],
    []
  );

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
            style={styles.input}
            value={attentionFocus}
            onChangeText={setAttentionFocus}
            placeholder="Example: work tasks, social media, worries..."
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.label}>Were you moving automatically or with intention?</Text>
          <View style={styles.optionRow}>
            {modeOptions.map((option) => {
              const selected = mode === option;
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.optionButton, selected && styles.optionButtonActive]}
                  onPress={() => setMode(option)}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextActive]}>{option}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>What pulled you away?</Text>
          <TextInput
            style={styles.input}
            value={pulledAway}
            onChangeText={setPulledAway}
            placeholder="Example: notifications, overthinking, noise..."
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.label}>What brought you back?</Text>
          <TextInput
            style={styles.input}
            value={broughtBack}
            onChangeText={setBroughtBack}
            placeholder="Example: breath, timer, short break..."
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.label}>When did you feel most present?</Text>
          <TextInput
            style={styles.input}
            value={presentMoment}
            onChangeText={setPresentMoment}
            placeholder="Example: while walking, talking, journaling..."
            placeholderTextColor="#94A3B8"
          />
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={saveEntry}>
          <Text style={styles.saveButtonText}>Save Meditation</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>RECENT MEDITATIONS</Text>

          {entries.length === 0 ? (
            <Text style={styles.emptyText}>No meditations yet. Start with one honest observation.</Text>
          ) : (
            entries.slice(0, 8).map((entry) => (
              <View key={entry.id} style={styles.logCard}>
                <Text style={styles.logDate}>{entry.date}</Text>
                <Text style={styles.logLine}>Attention: {entry.attentionFocus || "Not logged"}</Text>
                <Text style={styles.logLine}>Mode: {entry.mode}</Text>
                <Text style={styles.logLine}>Pulled away: {entry.pulledAway || "Not logged"}</Text>
                <Text style={styles.logLine}>Brought back: {entry.broughtBack || "Not logged"}</Text>
                <Text style={styles.logLine}>Present moment: {entry.presentMoment || "Not logged"}</Text>
              </View>
            ))
          )}
        </View>

        <TouchableOpacity style={styles.clearButton} onPress={clearEntries}>
          <Text style={styles.clearButtonText}>Clear Meditations</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backButton} onPress={() => router.push("/")}>
          <Text style={styles.backButtonText}>Back to Today</Text>
        </TouchableOpacity>
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
    paddingBottom: 44,
  },
  shell: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 18,
  },
  hero: {
    backgroundColor: "#111827",
    borderWidth: 3,
    borderColor: "#A78BFA",
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
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 6,
  },
  subtitle: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  lunaCard: {
    backgroundColor: "#1E1B4B",
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  lunaName: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 8,
  },
  lunaText: {
    color: "#EDE9FE",
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 20,
    padding: 15,
    marginBottom: 12,
  },
  label: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    backgroundColor: "#020617",
    borderWidth: 2,
    borderColor: "#475569",
    borderRadius: 14,
    color: "#F9FAFB",
    fontSize: 15,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  optionButton: {
    width: "32%",
    backgroundColor: "#1F2937",
    borderWidth: 2,
    borderColor: "#475569",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  optionButtonActive: {
    backgroundColor: "#111827",
    borderColor: "#FBBF24",
  },
  optionText: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "800",
    fontFamily: pixelFont,
  },
  optionTextActive: {
    color: "#FDE68A",
  },
  saveButton: {
    backgroundColor: "#6D28D9",
    borderWidth: 2,
    borderColor: "#FBBF24",
    borderRadius: 15,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  saveButtonText: {
    color: "#F9FAFB",
    fontSize: 15,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
  sectionTitle: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 8,
  },
  emptyText: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 20,
  },
  logCard: {
    backgroundColor: "#0F172A",
    borderWidth: 2,
    borderColor: "#A78BFA",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  logDate: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 4,
  },
  logLine: {
    color: "#E2E8F0",
    fontSize: 13,
    lineHeight: 19,
  },
  clearButton: {
    backgroundColor: "#7F1D1D",
    borderWidth: 2,
    borderColor: "#EF4444",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  clearButtonText: {
    color: "#FEE2E2",
    fontWeight: "900",
    fontFamily: pixelFont,
    fontSize: 13,
  },
  backButton: {
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#64748B",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  backButtonText: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
});