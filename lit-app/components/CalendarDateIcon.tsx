import { useEffect, useState } from "react";
import { AppState, Platform, StyleSheet, Text, View, type AppStateStatus } from "react-native";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type CalendarDateIconProps = {
  /** Defaults to "now" and re-derives itself at local midnight/foreground when omitted — pass
   *  an explicit date only for a fixed, non-live rendering (e.g. a snapshot in a preview). */
  date?: Date;
  size?: "small" | "medium";
  selected?: boolean;
  accent?: string;
};

/**
 * Small pixel calendar-page icon showing the current LOCAL civil day of month (1-31) — this is
 * the calendar date shown to the user, distinct from the app's 6:00 AM logical quest-day key
 * (getQuestDayKey/getTodayKey in lib/scheduling.ts). Never derive quest-day logic from this
 * component; it exists purely as a navigation icon.
 */
export function CalendarDateIcon({ date, size = "small", selected = false, accent = "#B3261E" }: CalendarDateIconProps) {
  const [now, setNow] = useState<Date>(() => date ?? new Date());

  useEffect(() => {
    if (date) return; // Caller controls the date explicitly — no self-driven refresh.
    setNow(new Date());

    // Re-check every minute (cheap) so the shown day rolls over at local midnight without
    // requiring the user to background/foreground the app first.
    const interval = setInterval(() => setNow(new Date()), 60000);

    const onAppStateChange = (next: AppStateStatus) => {
      if (next === "active") setNow(new Date());
    };
    const subscription = AppState.addEventListener("change", onAppStateChange);

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [date]);

  const shown = date ?? now;
  const dayOfMonth = shown.getDate();
  const monthLabel = MONTH_NAMES[shown.getMonth()];
  const dims = size === "medium" ? styles.medium : styles.small;

  return (
    <View
      style={[styles.page, dims, selected && { borderColor: "#FDE68A" }]}
      accessibilityRole="image"
      accessibilityLabel={`Calendar, ${monthLabel} ${dayOfMonth}`}
    >
      <View style={[styles.strip, { backgroundColor: accent }, selected && { backgroundColor: "#FDE68A" }]} />
      <View style={styles.body}>
        <Text
          style={[styles.dayText, size === "medium" && styles.dayTextMedium, selected && { color: "#FDE68A" }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {dayOfMonth}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    borderWidth: 2,
    borderColor: "#5C4425",
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "#EAD9B6",
    // Fixed width regardless of 1 vs 2-digit day — no layout shift between e.g. "3" and "13".
    alignItems: "stretch",
  },
  small: { width: 18, height: 20 },
  medium: { width: 28, height: 32 },
  strip: { height: 5, width: "100%" },
  body: { flex: 1, alignItems: "center", justifyContent: "center" },
  dayText: { color: "#4A3620", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", lineHeight: 12 },
  dayTextMedium: { fontSize: 15, lineHeight: 17 },
});
