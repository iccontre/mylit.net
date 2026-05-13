import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

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

export default function JournalScreen() {
  const [entryType, setEntryType] = useState<"Morning" | "Evening">("Morning");
  const [mood, setMood] = useState("7");
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
    setMood("7");
    setThoughtPattern("");
    setThoughtImpact("Neutral");
    setHonestReframe("");
    setMindLesson("");
  }

  async function clearEntries() {
    await saveEntries([]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Journal</Text>

      <View style={styles.lunaCard}>
        <Text style={styles.lunaName}>🌙 Luna</Text>
        <Text style={styles.lunaText}>
          This is your space to be honest. You do not need the perfect words — just tell the truth
          about where you are today.
        </Text>
      </View>

      <View style={styles.card}>
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
              : "Example: I learned that I need to make my goals smaller on low-energy days."
          }
          placeholderTextColor="#9CA3AF"
          value={content}
          onChangeText={setContent}
        />

        <Text style={styles.label}>One thing you are grateful for</Text>
        <TextInput
          style={styles.input}
          placeholder="Example: I got through the day."
          placeholderTextColor="#9CA3AF"
          value={gratitude}
          onChangeText={setGratitude}
        />
      </View>

      <View style={styles.metaCard}>
        <Text style={styles.metaTitle}>Metacognitive Check-In</Text>
        <Text style={styles.metaSubtitle}>
          Notice how your mind worked today. This helps you understand your thoughts instead of being controlled by them.
        </Text>

        <Text style={styles.label}>What thought pattern showed up today?</Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Example: overthinking, avoidance, comparison, self-doubt, clarity, motivation..."
          placeholderTextColor="#9CA3AF"
          value={thoughtPattern}
          onChangeText={setThoughtPattern}
        />

        <Text style={styles.label}>Was this thought helpful, harmful, or neutral?</Text>

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

        <Text style={styles.label}>What is a more honest way to look at it?</Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Example: I am not lazy. I was tired and needed a smaller first step."
          placeholderTextColor="#9CA3AF"
          value={honestReframe}
          onChangeText={setHonestReframe}
        />

        <Text style={styles.label}>What did you learn about how your mind worked today?</Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Example: I avoid tasks when they feel too big, but I can start when I make them smaller."
          placeholderTextColor="#9CA3AF"
          value={mindLesson}
          onChangeText={setMindLesson}
        />
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={saveJournalEntry}>
        <Text style={styles.saveButtonText}>Save Journal Entry</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Recent Entries</Text>

      {entries.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            No journal entries yet. Start with one honest sentence.
          </Text>
        </View>
      ) : (
        entries.map((entry) => (
          <View key={entry.id} style={styles.entryCard}>
            <Text style={styles.entryType}>{entry.type} Entry</Text>
            <Text style={styles.entryDate}>{entry.createdAt}</Text>
            <Text style={styles.entryMood}>Mood: {entry.mood}/10</Text>

            {entry.content ? <Text style={styles.entryText}>{entry.content}</Text> : null}

            {entry.gratitude ? (
              <Text style={styles.gratitudeText}>Grateful for: {entry.gratitude}</Text>
            ) : null}

            {entry.thoughtPattern ? (
              <View style={styles.savedMetaBox}>
                <Text style={styles.savedMetaTitle}>Metacognitive note</Text>
                <Text style={styles.savedMetaText}>Pattern: {entry.thoughtPattern}</Text>
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
        <TouchableOpacity style={styles.homeButton}>
          <Text style={styles.homeButtonText}>Back to Today</Text>
        </TouchableOpacity>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7EBC8",
  },
  container: {
    padding: 24,
    paddingTop: 70,
    paddingBottom: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 18,
  },
  lunaCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#E5D39A",
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
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#E5D39A",
  },
  metaCard: {
    backgroundColor: "#EEF2FF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  metaTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 6,
  },
  metaSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: "#374151",
    fontWeight: "700",
    marginBottom: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: "900",
    color: "#374151",
    marginBottom: 10,
    marginTop: 12,
    textTransform: "uppercase",
  },
  toggleRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  toggleButton: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    padding: 14,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    marginRight: 8,
  },
  activeToggle: {
    flex: 1,
    backgroundColor: "#111827",
    padding: 14,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FBBF24",
    marginRight: 8,
  },
  toggleText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#374151",
  },
  activeToggleText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  input: {
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    padding: 14,
    fontSize: 16,
    color: "#111827",
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  textArea: {
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    padding: 14,
    minHeight: 110,
    fontSize: 16,
    color: "#111827",
    marginBottom: 8,
    textAlignVertical: "top",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  impactRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  impactButton: {
    width: "31%",
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  helpfulImpact: {
    width: "31%",
    backgroundColor: "#16A34A",
    padding: 12,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#166534",
  },
  neutralImpact: {
    width: "31%",
    backgroundColor: "#111827",
    padding: 12,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  harmfulImpact: {
    width: "31%",
    backgroundColor: "#991B1B",
    padding: 12,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FCA5A5",
  },
  impactText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#374151",
  },
  activeImpactText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  saveButton: {
    backgroundColor: "#111827",
    padding: 18,
    borderRadius: 20,
    alignItems: "center",
    marginBottom: 22,
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
  entryType: {
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
  entryMood: {
    fontSize: 15,
    fontWeight: "800",
    color: "#374151",
    marginBottom: 8,
  },
  entryText: {
    fontSize: 16,
    lineHeight: 23,
    color: "#111827",
    marginBottom: 8,
  },
  gratitudeText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#166534",
    fontWeight: "700",
  },
  savedMetaBox: {
    backgroundColor: "#EEF2FF",
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  savedMetaTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#312E81",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  savedMetaText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#374151",
    fontWeight: "700",
    marginBottom: 4,
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