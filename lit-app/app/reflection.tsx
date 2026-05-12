import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function ReflectionScreen() {
  const params = useLocalSearchParams();
  const questTitle = typeof params.quest === "string" ? params.quest : "this quest";

  const [obstacle, setObstacle] = useState("");
  const [adjustment, setAdjustment] = useState("");

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Reflection Mode</Text>

      <View style={styles.lunaCard}>
        <Text style={styles.lunaName}>🌙 Luna</Text>
        <Text style={styles.lunaText}>
          Missing a quest does not mean you failed. It means we found something
          to understand. Let’s figure out what got in the way.
        </Text>
      </View>

      <View style={styles.questCard}>
        <Text style={styles.label}>Quest</Text>
        <Text style={styles.questTitle}>{questTitle}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>What got in the way?</Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Example: I was tired, anxious, distracted, busy, or the goal was too hard."
          placeholderTextColor="#9CA3AF"
          value={obstacle}
          onChangeText={setObstacle}
        />

        <Text style={styles.label}>What should we adjust tomorrow?</Text>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Example: Make it smaller, move it earlier, or switch to Recovery."
          placeholderTextColor="#9CA3AF"
          value={adjustment}
          onChangeText={setAdjustment}
        />
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Luna’s reminder</Text>
        <Text style={styles.summaryText}>
          Your next step does not need to be perfect. It just needs to be honest.
        </Text>
      </View>

      <Link href="/" asChild>
        <TouchableOpacity style={styles.button}>
          <Text style={styles.buttonText}>Save Reflection</Text>
        </TouchableOpacity>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#111827",
  },
  container: {
    padding: 24,
    paddingTop: 70,
  },
  title: {
    fontSize: 36,
    fontWeight: "900",
    color: "#F9FAFB",
    marginBottom: 18,
  },
  lunaCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#A78BFA",
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
  questCard: {
    backgroundColor: "#312E81",
    borderRadius: 22,
    padding: 18,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  label: {
    fontSize: 14,
    fontWeight: "900",
    color: "#D1D5DB",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  questTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
  },
  textArea: {
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    padding: 14,
    minHeight: 100,
    fontSize: 16,
    color: "#111827",
    marginBottom: 18,
    textAlignVertical: "top",
  },
  summaryCard: {
    backgroundColor: "#1F2937",
    borderRadius: 22,
    padding: 18,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FBBF24",
    marginBottom: 6,
  },
  summaryText: {
    fontSize: 16,
    lineHeight: 23,
    color: "#E5E7EB",
  },
  button: {
    backgroundColor: "#FBBF24",
    padding: 18,
    borderRadius: 20,
    alignItems: "center",
  },
  buttonText: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900",
  },
});
