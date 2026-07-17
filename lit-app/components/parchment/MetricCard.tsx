import { Platform, StyleSheet, Text, View } from "react-native";

import { parchmentField, parchmentInk } from "../../constants/parchmentTokens";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

type MetricCardProps = {
  icon: string;
  label: string;
  value: string;
  /** Left-edge accent — Stats uses gold/green/purple to distinguish steps/progress/recovery. */
  accent: string;
};

/**
 * Parchment row with a colored left edge, icon, label, and a right-aligned value — Stats'
 * "Total steps"/"Progress quests"/etc. rows and Weekly Summary's metric list.
 */
export function MetricCard({ icon, label, value, accent }: MetricCardProps) {
  return (
    <View style={[styles.row, { borderLeftColor: accent }]}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: parchmentField,
    borderWidth: 2,
    borderColor: "#5C4425",
    borderLeftWidth: 6,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  icon: { fontSize: 18, marginRight: 10 },
  label: { flex: 1, fontFamily: pixelFont, fontSize: 13, fontWeight: "800", color: parchmentInk },
  value: { fontFamily: pixelFont, fontSize: 15, fontWeight: "900", color: parchmentInk },
});
