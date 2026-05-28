import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type QueueItem = {
  text: string;
  type: string;
};

const STORAGE_KEY = "lit_tomorrow_queue";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

function guessType(text: string) {
  const lower = text.toLowerCase();

  if (lower.includes("cook") || lower.includes("meal") || lower.includes("recipe") || lower.includes("eat")) {
    return "Meal Quest";
  }

  if (lower.includes("study") || lower.includes("homework") || lower.includes("assignment")) {
    return "Focus Quest";
  }

  if (lower.includes("workout") || lower.includes("gym") || lower.includes("walk")) {
    return "Body Quest";
  }

  if (lower.includes("text") || lower.includes("friend") || lower.includes("call")) {
    return "Connection Quest";
  }

  return "Personal Quest";
}

export default function TomorrowQueueScreen() {
  const [request, setRequest] = useState("");
  const [items, setItems] = useState<QueueItem[]>([]);

  useEffect(() => {
    loadQueue();
  }, []);

  async function loadQueue() {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setItems(Array.isArray(parsed) ? parsed : []);
      } catch {
        setItems([]);
      }
    } else {
      setItems([]);
    }
  }

  async function saveQueue(nextItems: QueueItem[]) {
    setItems(nextItems);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextItems));
  }

  async function addToQueue() {
    if (!request.trim()) return;

    const newItem = {
      text: request.trim(),
      type: guessType(request),
    };

    const nextItems = [newItem, ...items];
    await saveQueue(nextItems);
    setRequest("");
  }

  async function clearQueue() {
    await saveQueue([]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.shell}>
        <Text style={styles.title}>QUICK THOUGHTS</Text>
        <Text style={styles.summary}>
          Save a task for tomorrow. It will appear in Calendar and become a +2 quest.
        </Text>

        <View style={styles.lunaCard}>
          <Text style={styles.lunaName}>🌙 Luna</Text>
          <Text style={styles.lunaText}>
            Save it now. Tomorrow it shows up as your personal quest.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>What should tomorrow-you remember?</Text>

          <TextInput
            style={styles.input}
            placeholder="Example: finish coding app at coffee shop"
            placeholderTextColor="#94A3B8"
            value={request}
            onChangeText={setRequest}
          />

          <TouchableOpacity style={styles.addButton} onPress={addToQueue}>
            <Text style={styles.addButtonText}>Tomorrow’s Quest</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Saved Tomorrow Quests</Text>

        {items.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              No quick thoughts saved yet. Add one task and it becomes tomorrow’s +2 quest.
            </Text>
          </View>
        ) : (
          items.map((item, index) => (
            <View key={`${item.text}-${index}`} style={styles.queueCard}>
              <Text style={styles.questLabel}>Tomorrow’s Quest</Text>
              <Text style={styles.queueTitle}>{item.text}</Text>
              <Text style={styles.queueMeta}>+2 steps • Shows in Calendar</Text>
            </View>
          ))
        )}

        {items.length > 0 && (
          <TouchableOpacity style={styles.clearButton} onPress={clearQueue}>
            <Text style={styles.clearButtonText}>Clear Quick Thoughts</Text>
          </TouchableOpacity>
        )}

        <Link href="/" asChild>
          <TouchableOpacity style={styles.homeButton}>
            <Text style={styles.homeButtonText}>Back to Today</Text>
          </TouchableOpacity>
        </Link>
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
    paddingBottom: 42,
  },
  shell: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 18,
  },
  title: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 32,
    fontWeight: "900",
    marginBottom: 6,
    letterSpacing: 1,
  },
  summary: {
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  lunaCard: {
    backgroundColor: "#111827",
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  lunaName: {
    fontSize: 18,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 8,
    fontFamily: pixelFont,
  },
  lunaText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#E2E8F0",
  },
  card: {
    backgroundColor: "#111827",
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: "#334155",
  },
  label: {
    fontSize: 12,
    fontWeight: "900",
    color: "#E2E8F0",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontFamily: pixelFont,
  },
  input: {
    backgroundColor: "#020617",
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    color: "#F9FAFB",
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#475569",
  },
  addButton: {
    backgroundColor: "#1D4ED8",
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#38BDF8",
  },
  addButtonText: {
    color: "#F9FAFB",
    fontSize: 15,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FDE68A",
    marginBottom: 10,
    fontFamily: pixelFont,
  },
  emptyCard: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 14,
    borderWidth: 2,
    borderColor: "#334155",
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#94A3B8",
  },
  queueCard: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "#FBBF24",
  },
  questLabel: {
    color: "#FDE68A",
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 4,
    fontFamily: pixelFont,
    textTransform: "uppercase",
  },
  queueTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 5,
  },
  queueMeta: {
    fontSize: 12,
    color: "#CBD5E1",
    fontWeight: "700",
  },
  clearButton: {
    backgroundColor: "#7F1D1D",
    padding: 13,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 4,
    borderWidth: 2,
    borderColor: "#EF4444",
  },
  clearButtonText: {
    color: "#FEE2E2",
    fontSize: 14,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
  homeButton: {
    backgroundColor: "#111827",
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 10,
    borderWidth: 2,
    borderColor: "#64748B",
  },
  homeButtonText: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "900",
    fontFamily: pixelFont,
  },
});