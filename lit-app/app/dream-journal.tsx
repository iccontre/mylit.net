import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type DreamJournalEntry = {
  id: string;
  date: string;
  dreamRecall: string;
  dreamMood: string;
  symbols: string;
  connectionToIntention: string;
  oneThingToRemember: string;
  createdAt: string;
};

const DREAM_JOURNAL_KEY = "lit_dream_journal";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

export default function DreamJournalScreen() {
  const router = useRouter();

  const [dreamRecall, setDreamRecall] = useState("");
  const [dreamMood, setDreamMood] = useState("");
  const [symbols, setSymbols] = useState("");
  const [connectionToIntention, setConnectionToIntention] = useState("");
  const [oneThingToRemember, setOneThingToRemember] = useState("");
  const [entries, setEntries] = useState<DreamJournalEntry[]>([]);

  useEffect(() => {
    loadEntries();
  }, []);

  async function loadEntries() {
    const saved = await AsyncStorage.getItem(DREAM_JOURNAL_KEY);
    if (saved) {
      setEntries(JSON.parse(saved));
    }
  }

  async function saveDream() {
    const hasAny =
      dreamRecall.trim() ||
      dreamMood.trim() ||
      symbols.trim() ||
      connectionToIntention.trim() ||
      oneThingToRemember.trim();

    if (!hasAny) return;

    const now = new Date();
    const entry: DreamJournalEntry = {
      id: String(Date.now()),
      date: now.toLocaleDateString(),
      dreamRecall: dreamRecall.trim(),
      dreamMood: dreamMood.trim(),
      symbols: symbols.trim(),
      connectionToIntention: connectionToIntention.trim(),
      oneThingToRemember: oneThingToRemember.trim(),
      createdAt: now.toISOString(),
    };

    const next = [entry, ...entries];
    setEntries(next);
    await AsyncStorage.setItem(DREAM_JOURNAL_KEY, JSON.stringify(next));

    setDreamRecall("");
    setDreamMood("");
    setSymbols("");
    setConnectionToIntention("");
    setOneThingToRemember("");
  }

  async function clearDreamJournal() {
    setEntries([]);
    await AsyncStorage.setItem(DREAM_JOURNAL_KEY, JSON.stringify([]));
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.shell}>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>NIGHT NOTES</Text>
          <Text style={styles.title}>DREAM JOURNAL</Text>
          <Text style={styles.subtitle}>
            Record what you remember. Look for signals, not certainty.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>What do you remember from the dream?</Text>
          <TextInput
            style={styles.textArea}
            multiline
            placeholder="Write scenes, fragments, or anything that stood out."
            placeholderTextColor="#94A3B8"
            value={dreamRecall}
            onChangeText={setDreamRecall}
          />

          <Text style={styles.label}>What mood did the dream leave behind?</Text>
          <TextInput
            style={styles.input}
            placeholder="Example: calm, tense, curious, hopeful"
            placeholderTextColor="#94A3B8"
            value={dreamMood}
            onChangeText={setDreamMood}
          />

          <Text style={styles.label}>What symbols, scenes, or people stood out?</Text>
          <TextInput
            style={styles.textArea}
            multiline
            placeholder="Notice objects, places, people, or repeated themes."
            placeholderTextColor="#94A3B8"
            value={symbols}
            onChangeText={setSymbols}
          />

          <Text style={styles.label}>Did anything connect to last night’s intention?</Text>
          <TextInput
            style={styles.textArea}
            multiline
            placeholder="Write what might relate, even if it feels small."
            placeholderTextColor="#94A3B8"
            value={connectionToIntention}
            onChangeText={setConnectionToIntention}
          />

          <Text style={styles.label}>What is one thing you want to remember?</Text>
          <TextInput
            style={styles.input}
            placeholder="One short reminder from this dream."
            placeholderTextColor="#94A3B8"
            value={oneThingToRemember}
            onChangeText={setOneThingToRemember}
          />

          <TouchableOpacity style={styles.saveButton} onPress={saveDream}>
            <Text style={styles.saveButtonText}>Save Dream</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>SAVED DREAMS</Text>
        {entries.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No dream entries yet. Save one when you remember.</Text>
          </View>
        ) : (
          entries.map((entry) => (
            <View key={entry.id} style={styles.entryCard}>
              <Text style={styles.entryDate}>{entry.date}</Text>
              {entry.dreamRecall ? <Text style={styles.entryText}>Recall: {entry.dreamRecall}</Text> : null}
              {entry.dreamMood ? <Text style={styles.entryText}>Mood: {entry.dreamMood}</Text> : null}
              {entry.symbols ? <Text style={styles.entryText}>Symbols: {entry.symbols}</Text> : null}
              {entry.connectionToIntention ? (
                <Text style={styles.entryText}>Intention link: {entry.connectionToIntention}</Text>
              ) : null}
              {entry.oneThingToRemember ? (
                <Text style={styles.entryText}>Remember: {entry.oneThingToRemember}</Text>
              ) : null}
            </View>
          ))
        )}

        <TouchableOpacity style={styles.clearButton} onPress={clearDreamJournal}>
          <Text style={styles.clearButtonText}>Clear Dream Journal</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backButton} onPress={() => router.push("/sleep")}>
          <Text style={styles.backButtonText}>Back to Sleep</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B1220" },
  container: { paddingTop: 30, paddingBottom: 40 },
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
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
  },
  heroLabel: {
    color: "#C4B5FD",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    fontFamily: pixelFont,
    marginBottom: 6,
  },
  title: {
    color: "#F9FAFB",
    fontSize: 30,
    fontWeight: "900",
    fontFamily: pixelFont,
    marginBottom: 6,
  },
  subtitle: {
    color: "#E2E8F0",
    fontSize: 13,
    lineHeight: 19,
    fontFamily: pixelFont,
  },

  card: {
    backgroundColor: "#111827",
    borderColor: "#FBBF24",
    borderWidth: 2,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  label: {
    color: "#F9FAFB",
    fontSize: 12,
    fontWeight: "900",
    fontFamily: pixelFont,
    marginBottom: 6,
    marginTop: 8,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: "#020617",
    color: "#F9FAFB",
    borderColor: "#475569",
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: pixelFont,
  },
  textArea: {
    backgroundColor: "#020617",
    color: "#F9FAFB",
    borderColor: "#475569",
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 80,
    textAlignVertical: "top",
    fontSize: 14,
    fontFamily: pixelFont,
  },
  saveButton: {
    backgroundColor: "#6D28D9",
    borderColor: "#FBBF24",
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 12,
  },
  saveButtonText: {
    color: "#F9FAFB",
    fontSize: 13,
    fontWeight: "900",
    fontFamily: pixelFont,
    letterSpacing: 0.5,
  },

  sectionTitle: {
    color: "#F9FAFB",
    fontSize: 14,
    fontWeight: "900",
    fontFamily: pixelFont,
    marginBottom: 8,
    letterSpacing: 0.8,
  },
  emptyCard: {
    backgroundColor: "#111827",
    borderColor: "#334155",
    borderWidth: 2,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  emptyText: {
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 19,
  },
  entryCard: {
    backgroundColor: "#111827",
    borderColor: "#A78BFA",
    borderWidth: 2,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  entryDate: {
    color: "#FDE68A",
    fontSize: 12,
    fontWeight: "900",
    fontFamily: pixelFont,
    marginBottom: 6,
  },
  entryText: {
    color: "#E2E8F0",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 4,
  },

  clearButton: {
    backgroundColor: "#3F1D1D",
    borderColor: "#EF4444",
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  clearButtonText: {
    color: "#FECACA",
    fontSize: 13,
    fontWeight: "900",
    fontFamily: pixelFont,
  },

  backButton: {
    backgroundColor: "#111827",
    borderColor: "#64748B",
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  backButtonText: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
});