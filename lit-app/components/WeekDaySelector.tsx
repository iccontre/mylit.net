import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * Shared week/day selector — same visual language as Calendar's Week View day-cards
 * (red top strip, parchment body, gold border for today/selected). Used by Day Plan and
 * Quests so both screens feel like one system instead of three separate pickers.
 */

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

function formatShortDate(date: Date): string {
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function formatWeekRangeLabel(weekDays: Date[]): string {
  if (weekDays.length === 0) return "";
  const first = weekDays[0];
  const last = weekDays[weekDays.length - 1];
  return `${formatShortDate(first)} – ${formatShortDate(last)}, ${last.getFullYear()}`;
}

export type WeekDaySelectorProps = {
  weekDays: Date[];
  selectedIndex: number;
  onSelectDay: (index: number) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  isToday: (date: Date) => boolean;
  /** Optional short label(s) shown inside each day card, e.g. "Habit set" / "2 items". */
  previewFor?: (date: Date, index: number) => string[];
};

export function WeekDaySelector({ weekDays, selectedIndex, onSelectDay, onPrevWeek, onNextWeek, isToday, previewFor }: WeekDaySelectorProps) {
  return (
    <View>
      <View style={styles.weekNavPanel}>
        <TouchableOpacity style={styles.weekArrow} onPress={onPrevWeek}>
          <Text style={styles.weekArrowText}>←</Text>
        </TouchableOpacity>
        <View style={styles.weekCenter}>
          <Text style={styles.weekKicker}>WEEK VIEW</Text>
          <Text style={styles.weekRange}>{formatWeekRangeLabel(weekDays)}</Text>
        </View>
        <TouchableOpacity style={styles.weekArrow} onPress={onNextWeek}>
          <Text style={styles.weekArrowText}>→</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayCardRow}>
        {weekDays.map((date, index) => {
          const today = isToday(date);
          const selected = index === selectedIndex;
          const preview = previewFor ? previewFor(date, index) : [];
          return (
            <View key={date.toISOString()} style={styles.dayCardWrap}>
              <Text style={styles.todayFlag}>{today ? "Today" : " "}</Text>
              <TouchableOpacity
                style={[styles.dayCard, today && styles.dayCardToday, selected && styles.dayCardSelected]}
                onPress={() => onSelectDay(index)}
              >
                <View style={styles.dayCardStrip}>
                  <Text style={styles.dayCardStripText}>{date.toLocaleDateString([], { weekday: "short" }).toUpperCase()}</Text>
                </View>
                <View style={styles.dayCardBody}>
                  <Text style={styles.dayCardDate}>{formatShortDate(date)}</Text>
                  {preview.slice(0, 2).map((line, lineIndex) => (
                    <Text key={lineIndex} style={styles.dayCardPreviewLine} numberOfLines={1}>
                      {line}
                    </Text>
                  ))}
                </View>
              </TouchableOpacity>
              {selected ? <View style={styles.dayCardPointer} /> : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  weekNavPanel: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(46,32,20,0.95)", borderWidth: 2, borderColor: "#5C4425", borderRadius: 8, padding: 8, marginBottom: 10 },
  weekArrow: { width: 42, height: 38, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FBBF24", backgroundColor: "rgba(69,43,8,0.55)" },
  weekArrowText: { color: "#FDE68A", fontFamily: pixelFont, fontSize: 18, fontWeight: "900" },
  weekCenter: { flex: 1, alignItems: "center" },
  weekKicker: { color: "#94A3B8", fontFamily: pixelFont, fontSize: 9, fontWeight: "900" },
  weekRange: { color: "#F8FAFC", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", marginTop: 3 },

  dayCardRow: { paddingBottom: 6, gap: 8 },
  dayCardWrap: { width: 96, alignItems: "center" },
  todayFlag: { color: "#FDE047", fontFamily: pixelFont, fontSize: 9, fontWeight: "900", marginBottom: 3, letterSpacing: 0.6 },
  dayCard: { width: "100%", borderRadius: 8, borderWidth: 2, borderColor: "#5C4425", overflow: "hidden", backgroundColor: "#E7D3A9" },
  dayCardToday: { borderColor: "#FBBF24", borderWidth: 3 },
  dayCardSelected: { borderColor: "#FDE047", borderWidth: 3, shadowColor: "#FDE047", shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  dayCardStrip: { backgroundColor: "#B3261E", paddingVertical: 5, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "#5C4425" },
  dayCardStripText: { color: "#FFF7E8", fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  dayCardBody: { backgroundColor: "#EAD9B6", paddingHorizontal: 7, paddingVertical: 6, minHeight: 52 },
  dayCardDate: { color: "#4A3620", fontFamily: pixelFont, fontSize: 12, fontWeight: "900", marginBottom: 4, textAlign: "center" },
  dayCardPreviewLine: { color: "#3D2C18", fontSize: 9, fontWeight: "800", marginBottom: 2 },
  dayCardPointer: { width: 0, height: 0, marginTop: 4, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#FDE047" },
});
