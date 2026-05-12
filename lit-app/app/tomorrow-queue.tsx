import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type QueueItem = {
  text: string;
  type: string;
};

const STORAGE_KEY = "lit_tomorrow_queue";

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

  return "Tomorrow Quest";
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
      setItems(JSON.parse(saved));
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
      <Text style={styles.title}>Tomorrow Queue</Text>

      <View style={styles.lunaCard}>
        <Text style={styles.lunaName}>🌙 Luna</Text>
        <Text style={styles.lunaText}>
          Save a thought before it disappears. I’ll help turn it into a small step tomorrow.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>What do you want to remember?</Text>

        <TextInput
          style={styles.input}
          placeholder="Example: I want to cook this tomorrow"
          placeholderTextColor="#9CA3AF"
          value={request}
          onChangeText={setRequest}
        />

        <TouchableOpacity style={styles.addButton} onPress={addToQueue}>
          <Text style={styles.addButtonText}>Add to Queue</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Saved for Tomorrow</Text>

      {items.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            Nothing saved yet. Add a small intention for tomorrow.
          </Text>
        </View>
      ) : (
        items.map((item, index) => (
          <View key={index} style={styles.queueCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.queueTitle}>{item.text}</Text>
              <Text style={styles.queueType}>{item.type}</Text>
            </View>
            <Text style={styles.steps}>+1</Text>
          </View>
        ))
      )}

      {items.length > 0 && (
        <TouchableOpacity style={styles.clearButton} onPress={clearQueue}>
          <Text style={styles.clearButtonText}>Clear Queue</Text>
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
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    padding: 14,
    fontSize: 16,
    color: "#111827",
    marginBottom: 14,
  },
  addButton: {
    backgroundColor: "#111827",
    padding: 16,
    borderRadius: 18,
    alignItems: "center",
  },
  addButtonText: {
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
  queueCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  queueTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 4,
  },
  queueType: {
    fontSize: 14,
    color: "#6B7280",
  },
  steps: {
    fontSize: 18,
    fontWeight: "900",
    color: "#16A34A",
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
