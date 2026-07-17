import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { parchmentField, parchmentInk } from "../../constants/parchmentTokens";
import { calendarStripRed } from "../../constants/worldTokens";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

type DayCardProps = {
  weekdayLabel: string;
  dateLabel: string;
  icon?: string;
  selected?: boolean;
  todayTag?: boolean;
  accent?: string;
  onPress?: () => void;
};

/** Red-strip header + parchment body day cell — Calendar/Quest Scheduler/Day Plan's weekday strip. */
export function DayCard({ weekdayLabel, dateLabel, icon, selected, todayTag, accent = calendarStripRed, onPress }: DayCardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, selected && { borderColor: "#F0A93B" }]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityLabel={`${weekdayLabel} ${dateLabel}`}
    >
      <View style={[styles.header, { backgroundColor: accent }]}>
        <Text style={styles.headerText}>{weekdayLabel}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.dateText}>{dateLabel}</Text>
        {icon ? <Text style={styles.icon}>{icon}</Text> : null}
        {todayTag ? <Text style={styles.todayTag}>TODAY</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 92,
    borderWidth: 3,
    borderColor: "#5C4425",
    borderRadius: 8,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 },
  },
  header: { paddingVertical: 8, alignItems: "center" },
  headerText: { fontFamily: pixelFont, fontSize: 11, fontWeight: "900", color: "#FFFFFF", letterSpacing: 0.5 },
  body: { backgroundColor: parchmentField, paddingVertical: 12, alignItems: "center", minHeight: 62, justifyContent: "center" },
  dateText: { fontFamily: pixelFont, fontSize: 13, fontWeight: "900", color: parchmentInk },
  icon: { fontSize: 13, marginTop: 4 },
  todayTag: { fontFamily: pixelFont, fontSize: 9, fontWeight: "900", color: "#F0A93B", marginTop: 4, letterSpacing: 0.5 },
});
