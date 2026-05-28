import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type QueueItem = {
  id: string;
  text: string;
  type: string;
  createdAt: string;
};

const STORAGE_KEY = "lit_tomorrow_queue";

export default function TomorrowQueueScreen() {
  const [text, setText] = useState("");
  const [items, setItems] = useState<QueueItem[]>([]);
  const mono = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace" });

  useEffect(() => {
    loadItems();
  }, []);

  async function loadItems() {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved) setItems(JSON.parse(saved));
  }

  async function saveItems(nextItems: QueueItem[]) {
    setItems(nextItems);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextItems));
  }

  async function saveThought() {
    if (!text.trim()) return;
    const newItem: QueueItem = {
      id: String(Date.now()),
      text: text.trim(),
      type: "General",
      createdAt: new Date().toLocaleString(),
    };
    await saveItems([newItem, ...items]);
    setText("");
  }

  async function clearThoughts() {
    await saveItems([]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.contentShell}>
        <View style={styles.headerCard}>
          <Text style={[styles.title, { fontFamily: mono }]}>QUICK THOUGHTS</Text>
          <Text style={styles.subtitle}>Save the thought before it disappears.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>What do you want to save?</Text>
          <TextInput
            style={styles.input}
            placeholder="Example: message mom, fix morning routine, finish reading"
            placeholderTextColor="#9CA3AF"
            value={text}
            onChangeText={setText}
          />
          <TouchableOpacity style={styles.primaryBtn} onPress={saveThought}>
            <Text style={styles.primaryBtnText}>Save Thought</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={[styles.sectionTitle, { fontFamily: mono }]}>SAVED THOUGHTS</Text>
          {items.length === 0 ? (
            <Text style={styles.emptyText}>No saved thoughts yet.</Text>
          ) : (
            items.map((item) => (
              <View key={item.id} style={styles.itemCard}>
                <Text style={styles.itemText}>Quick thought: {item.text}</Text>
                <Text style={styles.itemDate}>{item.createdAt}</Text>
              </View>
            ))
          )}
        </View>

        <TouchableOpacity style={styles.dangerBtn} onPress={clearThoughts}>
          <Text style={styles.dangerBtnText}>Clear Thoughts</Text>
        </TouchableOpacity>

        <Link href="/" asChild>
          <TouchableOpacity style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Back to Today</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0F172A" },
  container: { padding: 14, paddingTop: 42, paddingBottom: 28 },
  contentShell: { width: "100%", maxWidth: 520, alignSelf: "center" },

  headerCard: { backgroundColor: "#1E293B", borderWidth: 3, borderColor: "#38BDF8", borderRadius: 16, padding: 12, marginBottom: 10 },
  title: { color: "#F9FAFB", fontSize: 30, fontWeight: "900", letterSpacing: 1 },
  subtitle: { color: "#CBD5E1", fontSize: 12, fontWeight: "700", marginTop: 4 },

  card: { backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#334155", borderRadius: 14, padding: 12, marginBottom: 10 },
  sectionTitle: { color: "#111827", fontSize: 13, fontWeight: "900", letterSpacing: 1, marginBottom: 6 },
  label: { color: "#374151", fontSize: 12, fontWeight: "800", marginBottom: 5 },
  input: { borderWidth: 2, borderColor: "#D1D5DB", borderRadius: 10, backgroundColor: "#F3F4F6", padding: 10, color: "#111827", fontWeight: "700" },

  primaryBtn: { marginTop: 10, backgroundColor: "#111827", borderColor: "#38BDF8", borderWidth: 2, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "900", fontSize: 13 },

  emptyText: { color: "#4B5563", fontSize: 12, fontWeight: "700" },
  itemCard: { backgroundColor: "#E2E8F0", borderWidth: 1, borderColor: "#94A3B8", borderRadius: 8, padding: 8, marginBottom: 7 },
  itemText: { color: "#111827", fontSize: 12, fontWeight: "800" },
  itemDate: { color: "#475569", fontSize: 10, fontWeight: "700", marginTop: 3 },

  dangerBtn: { backgroundColor: "#7F1D1D", borderColor: "#FCA5A5", borderWidth: 2, borderRadius: 10, paddingVertical: 10, alignItems: "center", marginBottom: 8 },
  dangerBtnText: { color: "#FFFFFF", fontWeight: "900", fontSize: 13 },

  secondaryBtn: { backgroundColor: "#FFFFFF", borderColor: "#CBD5E1", borderWidth: 2, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  secondaryBtnText: { color: "#111827", fontWeight: "900", fontSize: 13 },
});