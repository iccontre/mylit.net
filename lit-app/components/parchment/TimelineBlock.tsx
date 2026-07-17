import { Platform, StyleSheet, Text, View } from "react-native";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

type TimelineBlockProps = {
  time: string;
  icon?: string;
  label: string;
  color: string;
  textColor?: string;
  style?: object;
};

/** Solid pastel-colored time block — Calendar Timeline's scheduled-item blocks. */
export function TimelineBlock({ time, icon, label, color, textColor = "#2B2620", style }: TimelineBlockProps) {
  return (
    <View style={[styles.block, { backgroundColor: color }, style]}>
      <Text style={[styles.time, { color: textColor }]}>{time}</Text>
      <View style={styles.labelRow}>
        {icon ? <Text style={styles.icon}>{icon}</Text> : null}
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    borderRadius: 6,
    padding: 12,
    marginBottom: 2,
  },
  time: { fontFamily: pixelFont, fontSize: 12, fontWeight: "900", marginBottom: 4 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  icon: { fontSize: 15 },
  label: { fontFamily: pixelFont, fontSize: 14, fontWeight: "900", flexShrink: 1 },
});
