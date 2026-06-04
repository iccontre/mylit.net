import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type DreamEntry = {
  id: string;
  title: string;
  summary: string;
  emotions: string;
  symbols: string;
  lucid: "yes" | "no";
  pattern: string;
  tomorrowIntention?: string;
  createdAt: string;
};

const DREAM_JOURNAL_KEY = "lit_dream_journal";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

function formatDreamDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DreamJournalScreen() {
  const router = useRouter();

  const [entries, setEntries] = useState<DreamEntry[]>([]);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [emotions, setEmotions] = useState("");
  const [symbols, setSymbols] = useState("");
  const [lucid, setLucid] = useState<"yes" | "no">("no");
  const [pattern, setPattern] = useState("");
  const [tomorrowIntention, setTomorrowIntention] = useState("");

  useEffect(() => {
    loadEntries();
  }, []);

  async function successHaptic() {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Haptics may not run in web preview.
    }
  }

  async function lightHaptic() {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics may not run in web preview.
    }
  }

  async function loadEntries() {
    const saved = await AsyncStorage.getItem(DREAM_JOURNAL_KEY);

    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      setEntries(Array.isArray(parsed) ? parsed : []);
    } catch {
      setEntries([]);
    }
  }

  async function saveEntries(nextEntries: DreamEntry[]) {
    setEntries(nextEntries);
    await AsyncStorage.setItem(DREAM_JOURNAL_KEY, JSON.stringify(nextEntries));
  }

  async function saveDream() {
    const hasDreamData =
      title.trim() ||
      summary.trim() ||
      emotions.trim() ||
      symbols.trim() ||
      pattern.trim() ||
      tomorrowIntention.trim();

    if (!hasDreamData) return;

    const entry: DreamEntry = {
      id: String(Date.now()),
      title: title.trim(),
      summary: summary.trim(),
      emotions: emotions.trim(),
      symbols: symbols.trim(),
      lucid,
      pattern: pattern.trim(),
      tomorrowIntention: tomorrowIntention.trim(),
      createdAt: new Date().toISOString(),
    };

    await saveEntries([entry, ...entries]);
    await successHaptic();

    setTitle("");
    setSummary("");
    setEmotions("");
    setSymbols("");
    setLucid("no");
    setPattern("");
    setTomorrowIntention("");
  }

  async function clearDreams() {
    await lightHaptic();
    await saveEntries([]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.shell}>
      <View style={styles.hero}>
        <Text style={styles.heroKicker}>SLEEP LOG</Text>
        <Text style={styles.title}>DREAM JOURNAL</Text>
        <Text style={styles.subtitle}>Capture symbols, emotion, lucidity, and the signal you want to carry into tomorrow.</Text>
      </View>

      <View style={styles.lunaCard}>
        <Text style={styles.lunaName}>Luna</Text>
        <Text style={styles.lunaText}>
          Write it down before the dream fades. Fragments count. Images count. A single feeling can be useful data.
        </Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.label}>Dream title</Text>
        <TextInput
          style={styles.input}
          placeholder="Example: The train under the ocean"
          placeholderTextColor="#94A3B8"
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>What happened in the dream?</Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Capture the scenes, people, places, and weird details you remember."
          placeholderTextColor="#94A3B8"
          value={summary}
          onChangeText={setSummary}
        />

        <Text style={styles.label}>Emotions</Text>
        <TextInput
          style={styles.input}
          placeholder="Example: calm, chased, curious, relieved"
          placeholderTextColor="#94A3B8"
          value={emotions}
          onChangeText={setEmotions}
        />

        <Text style={styles.label}>Symbols / repeated images</Text>
        <TextInput
          style={styles.input}
          placeholder="Example: water, locked doors, blue light, school"
          placeholderTextColor="#94A3B8"
          value={symbols}
          onChangeText={setSymbols}
        />

        <Text style={styles.label}>Was it lucid?</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={lucid === "no" ? styles.activeToggle : styles.toggleButton}
            onPress={() => setLucid("no")}
          >
            <Text style={lucid === "no" ? styles.activeToggleText : styles.toggleText}>No</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={lucid === "yes" ? styles.activeToggle : styles.toggleButton}
            onPress={() => setLucid("yes")}
          >
            <Text style={lucid === "yes" ? styles.activeToggleText : styles.toggleText}>Yes</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Pattern or possible meaning</Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Example: I keep dreaming about being unprepared when I avoid decisions."
          placeholderTextColor="#94A3B8"
          value={pattern}
          onChangeText={setPattern}
        />

        <Text style={styles.label}>Tomorrow intention from this dream</Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Example: Ask for help early instead of trying to solve everything alone."
          placeholderTextColor="#94A3B8"
          value={tomorrowIntention}
          onChangeText={setTomorrowIntention}
        />

        <TouchableOpacity style={styles.saveButton} onPress={saveDream}>
          <Text style={styles.saveButtonText}>Save Dream</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.historyCard}>
        <View style={styles.historyHeader}>
          <Text style={styles.historyTitle}>Dream History</Text>
          {entries.length > 0 ? (
            <TouchableOpacity style={styles.clearButton} onPress={clearDreams}>
              <Text style={styles.clearButtonText}>Clear</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {entries.length === 0 ? (
          <Text style={styles.emptyText}>No dreams logged yet. Add one fragment to start seeing patterns.</Text>
        ) : (
          entries.map((entry) => (
            <View key={entry.id} style={styles.entryCard}>
              <View style={styles.entryTopRow}>
                <Text style={styles.entryTitle}>{entry.title || "Untitled dream"}</Text>
                <Text style={styles.entryDate}>{formatDreamDate(entry.createdAt)}</Text>
              </View>

              {entry.summary ? <Text style={styles.entryText}>{entry.summary}</Text> : null}

              <View style={styles.tagRow}>
                <Text style={styles.tag}>Lucid: {entry.lucid === "yes" ? "Yes" : "No"}</Text>
                {entry.emotions ? <Text style={styles.tag}>Mood: {entry.emotions}</Text> : null}
              </View>

              {entry.symbols ? (
                <Text style={styles.entryDetail}>
                  <Text style={styles.detailLabel}>Symbols: </Text>
                  {entry.symbols}
                </Text>
              ) : null}

              {entry.pattern ? (
                <Text style={styles.entryDetail}>
                  <Text style={styles.detailLabel}>Pattern: </Text>
                  {entry.pattern}
                </Text>
              ) : null}

              {entry.tomorrowIntention ? (
                <Text style={styles.entryDetail}>
                  <Text style={styles.detailLabel}>Tomorrow: </Text>
                  {entry.tomorrowIntention}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </View>

      <View style={styles.navRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.push("/sleep")}>
          <Text style={styles.backButtonText}>Back to Sleep</Text>
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
    color: "#FDE68A",
    marginTop: 12,
    marginBottom: 7,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  input: {
    backgroundColor: "#111827",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#334155",
    color: "#F9FAFB",
    padding: 12,
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "700",
  },
  textArea: {
    minHeight: 96,
    backgroundColor: "#111827",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#334155",
    color: "#F9FAFB",
    padding: 12,
    textAlignVertical: "top",
    fontFamily: pixelFont,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  toggleRow: {
    flexDirection: "row",
    gap: 10,
  },
  toggleButton: {
    flex: 1,
    backgroundColor: "#111827",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#334155",
    paddingVertical: 12,
    alignItems: "center",
  },
  activeToggle: {
    flex: 1,
    backgroundColor: "#312E81",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#FBBF24",
    paddingVertical: 12,
    alignItems: "center",
  },
  toggleText: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
  },
  activeToggleText: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
  },
  saveButton: {
    backgroundColor: "#FBBF24",
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 16,
  },
  saveButtonText: {
    color: "#111827",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  historyCard: {
    backgroundColor: "#111827",
    borderRadius: 18,
    padding: 14,
    borderWidth: 2,
    borderColor: "#334155",
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  historyTitle: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 16,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  clearButton: {
    backgroundColor: "#1F2937",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#475569",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearButtonText: {
    color: "#FCA5A5",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  emptyText: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  entryCard: {
    backgroundColor: "#0F172A",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 12,
    marginTop: 10,
  },
  entryTopRow: {
    gap: 6,
    marginBottom: 8,
  },
  entryTitle: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
  },
  entryDate: {
    color: "#94A3B8",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "800",
  },
  entryText: {
    color: "#E5E7EB",
    fontFamily: pixelFont,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    marginBottom: 8,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 6,
  },
  tag: {
    backgroundColor: "#1E1B4B",
    borderRadius: 999,
    color: "#DDD6FE",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  entryDetail: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    marginTop: 5,
  },
  detailLabel: {
    color: "#FDE68A",
    fontWeight: "900",
  },
  navRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  backButton: {
    flex: 1,
    backgroundColor: "#1F2937",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#334155",
    paddingVertical: 14,
    alignItems: "center",
  },
  backButtonText: {
    color: "#E5E7EB",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
});