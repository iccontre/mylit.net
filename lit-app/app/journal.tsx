import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type JournalEntry = {
  id: string;
  type: "Morning" | "Evening";
  mood: string;
  content: string;
  gratitude: string;
  thoughtPattern: string;
  thoughtImpact: "Helpful" | "Harmful" | "Neutral";
  honestReframe: string;
  mindLesson: string;
  createdAt: string;
};

const STORAGE_KEY = "lit_journal_entries";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

export default function JournalScreen() {
  const [entryType, setEntryType] = useState<"Morning" | "Evening">("Morning");
  const [mood, setMood] = useState("");
  const [content, setContent] = useState("");
  const [gratitude, setGratitude] = useState("");

  const [thoughtPattern, setThoughtPattern] = useState("");
  const [thoughtImpact, setThoughtImpact] = useState<"Helpful" | "Harmful" | "Neutral">("Neutral");
  const [honestReframe, setHonestReframe] = useState("");
  const [mindLesson, setMindLesson] = useState("");

  const [entries, setEntries] = useState<JournalEntry[]>([]);

  useEffect(() => {
    loadEntries();
  }, []);

  async function loadEntries() {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved) {
      setEntries(JSON.parse(saved));
    }
  }

  async function saveEntries(nextEntries: JournalEntry[]) {
    setEntries(nextEntries);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextEntries));
  }

  async function saveJournalEntry() {
    const hasMainJournal = content.trim() || gratitude.trim();
    const hasMetacognition =
      thoughtPattern.trim() || honestReframe.trim() || mindLesson.trim();

    if (!hasMainJournal && !hasMetacognition) return;

    const newEntry: JournalEntry = {
      id: String(Date.now()),
      type: entryType,
      mood,
      content: content.trim(),
      gratitude: gratitude.trim(),
      thoughtPattern: thoughtPattern.trim(),
      thoughtImpact,
      honestReframe: honestReframe.trim(),
      mindLesson: mindLesson.trim(),
      createdAt: new Date().toLocaleString(),
    };

    const nextEntries = [newEntry, ...entries];
    await saveEntries(nextEntries);

    setContent("");
    setGratitude("");
    setMood("");
    setThoughtPattern("");
    setThoughtImpact("Neutral");
    setHonestReframe("");
    setMindLesson("");
  }

  async function clearEntries() {
    await saveEntries([]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.shell}>
      <View style={styles.hero}>
        <Text style={styles.heroKicker}>MIND LOG</Text>
        <Text style={styles.title}>JOURNAL</Text>
        <Text style={styles.subtitle}>Write what happened. Notice the pattern.</Text>
      </View>

      <View style={styles.lunaCard}>
        <Text style={styles.lunaName}>Luna</Text>
        <Text style={styles.lunaText}>
          Write what is actually happening. It does not need to sound perfect.
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.label}>Entry Type</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={entryType === "Morning" ? styles.activeToggle : styles.toggleButton}
            onPress={() => setEntryType("Morning")}
          >
            <Text style={entryType === "Morning" ? styles.activeToggleText : styles.toggleText}>
              Morning
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={entryType === "Evening" ? styles.activeToggle : styles.toggleButton}
            onPress={() => setEntryType("Evening")}
          >
            <Text style={entryType === "Evening" ? styles.activeToggleText : styles.toggleText}>
              Evening
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Mood (1-10)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder="Optional"
          placeholderTextColor="#94A3B8"
          value={mood}
          onChangeText={setMood}
        />

        <Text style={styles.label}>
          {entryType === "Morning"
            ? "What feels true about today?"
            : "What did today teach you?"}
        </Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder={
            entryType === "Morning"
              ? "Example: I feel tired, but I still want to take one small step."
              : "Example: I learned I need smaller goals on low-energy days."
          }
          placeholderTextColor="#94A3B8"
          value={content}
          onChangeText={setContent}
        />

        <Text style={styles.label}>One thing you appreciate</Text>
        <TextInput
          style={styles.input}
          placeholder="Example: I kept one promise today."
          placeholderTextColor="#94A3B8"
          value={gratitude}
          onChangeText={setGratitude}
        />
      </View>

      <View style={styles.metaPanel}>
        <Text style={styles.metaTitle}>Metacognitive Check-In</Text>
        <Text style={styles.metaSubtitle}>
          Notice how your mind worked today. Use data, not judgment.
        </Text>

        <Text style={styles.label}>What thought pattern showed up today?</Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Example: overthinking, avoidance, comparison, self-doubt..."
          placeholderTextColor="#94A3B8"
          value={thoughtPattern}
          onChangeText={setThoughtPattern}
        />

        <Text style={styles.label}>Was this thought helpful, neutral, or harmful?</Text>
        <View style={styles.impactRow}>
          <TouchableOpacity
            style={thoughtImpact === "Helpful" ? styles.helpfulImpact : styles.impactButton}
            onPress={() => setThoughtImpact("Helpful")}
          >
            <Text style={thoughtImpact === "Helpful" ? styles.activeImpactText : styles.impactText}>
              Helpful
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={thoughtImpact === "Neutral" ? styles.neutralImpact : styles.impactButton}
            onPress={() => setThoughtImpact("Neutral")}
          >
            <Text style={thoughtImpact === "Neutral" ? styles.activeImpactText : styles.impactText}>
              Neutral
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={thoughtImpact === "Harmful" ? styles.harmfulImpact : styles.impactButton}
            onPress={() => setThoughtImpact("Harmful")}
          >
            <Text style={thoughtImpact === "Harmful" ? styles.activeImpactText : styles.impactText}>
              Harmful
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>What is a more honest reframe?</Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Example: I am not lazy. I was tired and needed a smaller first step."
          placeholderTextColor="#94A3B8"
          value={honestReframe}
          onChangeText={setHonestReframe}
        />

        <Text style={styles.label}>What did you learn about your mind today?</Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Example: I avoid big tasks, but I can start small and keep going."
          placeholderTextColor="#94A3B8"
          value={mindLesson}
          onChangeText={setMindLesson}
        />
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={saveJournalEntry}>
        <Text style={styles.saveButtonText}>Save Journal Entry</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>RECENT LOGS</Text>

      {entries.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            No journal logs yet. Start with one honest sentence.
          </Text>
        </View>
      ) : (
        entries.map((entry) => (
          <View key={entry.id} style={styles.entryCard}>
            <Text style={styles.entryType}>{entry.type} Log</Text>
            <Text style={styles.entryDate}>{entry.createdAt}</Text>
            <Text style={styles.entryMood}>Mood: {entry.mood.trim() ? `${entry.mood}/10` : "Not entered"}</Text>

            {entry.content ? <Text style={styles.entryText}>{entry.content}</Text> : null}

            {entry.gratitude ? (
              <Text style={styles.gratitudeText}>Appreciation: {entry.gratitude}</Text>
            ) : null}

            {(entry.thoughtPattern || entry.honestReframe || entry.mindLesson) ? (
              <View style={styles.savedMetaBox}>
                <Text style={styles.savedMetaTitle}>Metacognitive Note</Text>
                {entry.thoughtPattern ? (
                  <Text style={styles.savedMetaText}>Pattern: {entry.thoughtPattern}</Text>
                ) : null}
                <Text style={styles.savedMetaText}>Impact: {entry.thoughtImpact}</Text>
                {entry.honestReframe ? (
                  <Text style={styles.savedMetaText}>Reframe: {entry.honestReframe}</Text>
                ) : null}
                {entry.mindLesson ? (
                  <Text style={styles.savedMetaText}>Lesson: {entry.mindLesson}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        ))
      )}

      {entries.length > 0 && (
        <TouchableOpacity style={styles.clearButton} onPress={clearEntries}>
          <Text style={styles.clearButtonText}>Clear Journal</Text>
        </TouchableOpacity>
      )}

      <Link href="/" asChild>
        <TouchableOpacity style={styles.backButton}>
          <Text style={styles.backButtonText}>Back to Today</Text>
        </TouchableOpacity>
      </Link>
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
  panel: {
    backgroundColor: "#0F172A",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: "#FBBF24",
  },
  metaPanel: {
    backgroundColor: "#1E1B4B",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: "#A78BFA",
  },
  metaTitle: {
    fontFamily: pixelFont,
    fontSize: 16,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  metaSubtitle: {
    fontFamily: pixelFont,
    fontSize: 12,
    lineHeight: 18,
    color: "#CBD5E1",
    fontWeight: "700",
    marginBottom: 8,
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
  toggleRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  toggleButton: {
    flex: 1,
    backgroundColor: "#111827",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#334155",
    marginRight: 8,
  },
  activeToggle: {
    flex: 1,
    backgroundColor: "#312E81",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#A78BFA",
    marginRight: 8,
  },
  toggleText: {
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    color: "#CBD5E1",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  activeToggleText: {
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    color: "#F9FAFB",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 12,
    fontSize: 15,
    color: "#F9FAFB",
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "#475569",
    fontFamily: pixelFont,
  },
  textArea: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 12,
    minHeight: 94,
    fontSize: 15,
    color: "#F9FAFB",
    marginBottom: 8,
    textAlignVertical: "top",
    borderWidth: 2,
    borderColor: "#475569",
    fontFamily: pixelFont,
  },
  impactRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  impactButton: {
    width: "31%",
    backgroundColor: "#111827",
    padding: 10,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#334155",
  },
  helpfulImpact: {
    width: "31%",
    backgroundColor: "#14532D",
    padding: 10,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#22C55E",
  },
  neutralImpact: {
    width: "31%",
    backgroundColor: "#1E293B",
    padding: 10,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#38BDF8",
  },
  harmfulImpact: {
    width: "31%",
    backgroundColor: "#7F1D1D",
    padding: 10,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#EF4444",
  },
  impactText: {
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    color: "#E5E7EB",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  activeImpactText: {
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    color: "#F9FAFB",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  saveButton: {
    backgroundColor: "#A78BFA",
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 14,
    borderWidth: 2,
    borderColor: "#EDE9FE",
  },
  saveButtonText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "900",
    fontFamily: pixelFont,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  sectionTitle: {
    fontFamily: pixelFont,
    fontSize: 18,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  emptyCard: {
    backgroundColor: "#111827",
    borderRadius: 14,
    padding: 12,
    borderWidth: 2,
    borderColor: "#334155",
    marginBottom: 12,
  },
  emptyText: {
    fontFamily: pixelFont,
    fontSize: 12,
    lineHeight: 18,
    color: "#CBD5E1",
    fontWeight: "700",
  },
  entryCard: {
    backgroundColor: "#111827",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  entryType: {
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
    color: "#F9FAFB",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  entryDate: {
    fontFamily: pixelFont,
    fontSize: 10,
    color: "#94A3B8",
    marginTop: 4,
    marginBottom: 8,
  },
  entryMood: {
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "800",
    color: "#E5E7EB",
    marginBottom: 8,
  },
  entryText: {
    fontFamily: pixelFont,
    fontSize: 12,
    lineHeight: 18,
    color: "#F9FAFB",
    marginBottom: 8,
  },
  gratitudeText: {
    fontFamily: pixelFont,
    fontSize: 11,
    lineHeight: 17,
    color: "#86EFAC",
    fontWeight: "700",
  },
  savedMetaBox: {
    backgroundColor: "#1E1B4B",
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  savedMetaTitle: {
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    color: "#E9D5FF",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  savedMetaText: {
    fontFamily: pixelFont,
    fontSize: 11,
    lineHeight: 17,
    color: "#E5E7EB",
    fontWeight: "700",
    marginBottom: 4,
  },
  clearButton: {
    backgroundColor: "#7F1D1D",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#EF4444",
  },
  clearButtonText: {
    color: "#FECACA",
    fontSize: 13,
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