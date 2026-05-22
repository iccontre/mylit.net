import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

type ReflectionEntry = {
  id: string;
  quest: string;
  whatGotInTheWay: string;
  whatWasOff: string;
  smallerVersion: string;
  nextTry: string;
  createdAt: string;
};

const REFLECTIONS_KEY = "lit_reflections";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

export default function ReflectionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const rawQuest = Array.isArray(params.quest) ? params.quest[0] : params.quest;
  const quest = rawQuest || "Open reflection";

  const [whatGotInTheWay, setWhatGotInTheWay] = useState("");
  const [whatWasOff, setWhatWasOff] = useState("");
  const [smallerVersion, setSmallerVersion] = useState("");
  const [nextTry, setNextTry] = useState("");

  async function saveReflection() {
    const newEntry: ReflectionEntry = {
      id: String(Date.now()),
      quest,
      whatGotInTheWay: whatGotInTheWay.trim(),
      whatWasOff: whatWasOff.trim(),
      smallerVersion: smallerVersion.trim(),
      nextTry: nextTry.trim(),
      createdAt: new Date().toISOString(),
    };

    const saved = await AsyncStorage.getItem(REFLECTIONS_KEY);
    const parsed: ReflectionEntry[] = saved ? JSON.parse(saved) : [];
    const next = [newEntry, ...parsed];

    await AsyncStorage.setItem(REFLECTIONS_KEY, JSON.stringify(next));
    router.push("/");
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.shell}>
        <View style={styles.hero}>
          <Text style={[styles.heroTitle, { fontFamily: pixelFont }]}>Reflect, Don’t Judge</Text>
          <Text style={styles.heroSubtitle}>Missed goals are data, not defeat.</Text>
        </View>

        <View style={styles.panel}>
          <Text style={[styles.panelTitle, { fontFamily: pixelFont }]}>QUEST</Text>
          <Text style={styles.questText}>{quest}</Text>

          <Text style={styles.label}>What got in the way?</Text>
          <TextInput style={styles.input} value={whatGotInTheWay} onChangeText={setWhatGotInTheWay} />

          <Text style={styles.label}>Was the quest too big, too vague, or badly timed?</Text>
          <TextInput style={styles.input} value={whatWasOff} onChangeText={setWhatWasOff} />

          <Text style={styles.label}>What is the smaller version?</Text>
          <TextInput style={styles.input} value={smallerVersion} onChangeText={setSmallerVersion} />

          <Text style={styles.label}>What can you try next?</Text>
          <TextInput style={styles.input} value={nextTry} onChangeText={setNextTry} />
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={saveReflection}>
          <Text style={styles.primaryBtnText}>Save Reflection</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push("/")}>
          <Text style={styles.secondaryBtnText}>Back to Today</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0F172A" },
  container: { padding: 14, paddingTop: 34, paddingBottom: 24 },
  shell: { width: "100%", maxWidth: 520, alignSelf: "center" },

  hero: { backgroundColor: "#312E81", borderWidth: 3, borderColor: "#A78BFA", borderRadius: 18, padding: 12, marginBottom: 10 },
  heroTitle: { color: "#F9FAFB", fontSize: 28, fontWeight: "900", letterSpacing: 1 },
  heroSubtitle: { color: "#DDD6FE", fontSize: 12, fontWeight: "700", marginTop: 4 },

  panel: { backgroundColor: "#FEF3C7", borderWidth: 2, borderColor: "#FBBF24", borderRadius: 12, padding: 12, marginBottom: 10 },
  panelTitle: { color: "#111827", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  questText: { color: "#374151", fontSize: 12, fontWeight: "700", marginTop: 4, marginBottom: 8 },

  label: { color: "#111827", fontSize: 12, fontWeight: "800", marginTop: 8, marginBottom: 4 },
  input: { borderWidth: 2, borderColor: "#D1D5DB", borderRadius: 10, backgroundColor: "#FFFFFF", padding: 10, color: "#111827", fontWeight: "700" },

  primaryBtn: { backgroundColor: "#111827", borderWidth: 2, borderColor: "#A78BFA", borderRadius: 10, paddingVertical: 11, alignItems: "center", marginBottom: 8 },
  primaryBtnText: { color: "#F9FAFB", fontSize: 13, fontWeight: "900" },

  secondaryBtn: { backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#CBD5E1", borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  secondaryBtnText: { color: "#111827", fontSize: 13, fontWeight: "900" },
});