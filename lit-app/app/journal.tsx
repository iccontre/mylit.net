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
  createdAt: string;
};

const STORAGE_KEY = "lit_journal_entries";

export default function JournalScreen() {
  const [entryType, setEntryType] = useState<"Morning" | "Evening">("Morning");
  const [mood, setMood] = useState("7");
  const [content, setContent] = useState("");
  const [gratitude, setGratitude] = useState("");
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
    if (!content.trim() && !gratitude.trim()) return;

    const newEntry: JournalEntry = {
      id: String(Date.now()),
      type: entryType,
      mood,
      content: content.trim(),
      gratitude: gratitude.trim(),
      createdAt: new Date().toLocaleString(),
    };

    const nextEntries = [newEntry, ...entries];
    await saveEntries(nextEntries);

    setContent("");
    setGratitude("");
    setMood("7");
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
            style={[styles.toggleButton, entryType === "Morning" && styles.activeToggle]}
            onPress={() => setEntryType("Morning")}
          >
            <Text
              style={[
                styles.toggleText,
                entryType === "Morning" && styles.activeToggleText,
              ]}
            >
              Morning
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toggleButton, entryType === "Evening" && styles.activeToggle]}
            onPress={() => setEntryType("Evening")}
          >
            <Text
              style={[
                styles.toggleText,
                entryType === "Evening" && styles.activeToggleText,
              ]}
            >
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

        <TouchableOpacity style={styles.saveButton} onPress={saveJournalEntry}>
          <Text style={styles.saveButtonText}>Save Journal Entry</Text>
        </TouchableOpacity>
      </View>

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
    marginBottom: 22,
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
  toggleRow: {
    flexDirection: "row",
    gap: 10,
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
  },
  activeToggle: {
    backgroundColor: "#111827",
    borderColor: "#FBBF24",
  },
  toggleText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#374151",
  },
  activeToggleText: {
    color: "#FFFFFF",
  },
  input: {
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    padding: 14,
    fontSize: 16,
    color: "#111827",
    marginBottom: 8,
  },
  textArea: {
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    padding: 14,
    minHeight: 120,
    fontSize: 16,
    color: "#111827",
    marginBottom: 8,
    textAlignVertical: "top",
  },
  saveButton: {
    backgroundColor: "#111827",
    padding: 16,
    borderRadius: 18,
    alignItems: "center",
    marginTop: 16,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
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
  },
  homeButtonText: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900",
  },
});
