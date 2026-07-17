import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { buildWeeklyAgentReview } from "../lib/weeklyReview";
import type { WeeklyAgentReview } from "../lib/agentTypes";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

function formatWeekRange(weekStart: string, weekEnd: string): string {
  const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(weekStart)} – ${fmt(weekEnd)}`;
}

/**
 * MYLIT's first weekly agent improvement loop, made visible. Rebuilding the review also
 * refreshes Learning Memory (see lib/weeklyReview.ts) — Evie's, Luna's, and Calendar's
 * summaries elsewhere in the app read straight from that memory, so this is the loop
 * actually closing, not just a static recap. No AI calls, no shame — every line here is a
 * supportive, deterministic template over the week's own data.
 */
export function WeeklyAgentReviewCard() {
  const [review, setReview] = useState<WeeklyAgentReview | null>(null);

  const load = useCallback(async () => {
    setReview(await buildWeeklyAgentReview(0));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (!review) return null;

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <Text style={[styles.panelTitle, styles.panelTitleInRow]}>✦ WEEKLY MYLIT REVIEW</Text>
        <TouchableOpacity style={styles.regenButton} onPress={() => void load()}>
          <Text style={styles.regenButtonText}>↻</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.panelSubtitle}>{formatWeekRange(review.weekStart, review.weekEnd)}</Text>

      <View style={[styles.row, { borderColor: "#22C55E" }]}>
        <Text style={[styles.rowLabel, { color: "#86EFAC" }]}>WHAT WENT WELL</Text>
        {review.wins.length ? (
          review.wins.map((line, index) => (
            <Text key={index} style={styles.rowText}>· {line}</Text>
          ))
        ) : (
          <Text style={styles.rowText}>Not enough data yet this week — that's okay, next week will have more to look at.</Text>
        )}
      </View>

      <View style={[styles.row, { borderColor: "#F472B6" }]}>
        <Text style={[styles.rowLabel, { color: "#FBCFE8" }]}>WHAT GOT IN THE WAY</Text>
        {review.struggles.length ? (
          review.struggles.map((line, index) => (
            <Text key={index} style={styles.rowText}>· {line}</Text>
          ))
        ) : (
          <Text style={styles.rowText}>Nothing stood out this week.</Text>
        )}
      </View>

      <View style={[styles.row, { borderColor: "#FBBF24" }]}>
        <Text style={[styles.rowLabel, { color: "#FDE68A" }]}>EVIE'S ADJUSTMENT</Text>
        <Text style={styles.rowText}>{review.evieAdjustment}</Text>
      </View>

      <View style={[styles.row, { borderColor: "#A78BFA" }]}>
        <Text style={[styles.rowLabel, { color: "#E9D5FF" }]}>LUNA'S SUPPORT NOTE</Text>
        <Text style={styles.rowText}>{review.lunaAdjustment}</Text>
      </View>

      <View style={[styles.row, { borderColor: "#38BDF8" }]}>
        <Text style={[styles.rowLabel, { color: "#BAE6FD" }]}>CALENDAR SUGGESTION</Text>
        <Text style={styles.rowText}>{review.calendarAdjustment}</Text>
      </View>

      <View style={[styles.row, { borderColor: "#475569" }]}>
        <Text style={[styles.rowLabel, { color: "#CBD5E1" }]}>NEXT WEEK FOCUS</Text>
        <Text style={styles.rowText}>{review.suggestedNextWeekFocus}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: "rgba(46,32,20, 0.95)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: "#5C4425",
  },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  panelTitle: {
    color: "#FDE047",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.5,
    textAlign: "center",
    marginBottom: 6,
  },
  panelTitleInRow: { flex: 1, marginBottom: 0 },
  panelSubtitle: { color: "#94A3B8", fontSize: 11, lineHeight: 16, fontWeight: "700", textAlign: "center", marginBottom: 10 },
  regenButton: {
    width: 32,
    height: 32,
    borderWidth: 2,
    borderColor: "#5C4425",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(46,32,20,0.9)",
  },
  regenButtonText: { color: "#CBD5E1", fontSize: 16, fontWeight: "900" },
  row: {
    borderWidth: 2,
    borderRadius: 6,
    padding: 9,
    marginBottom: 8,
    backgroundColor: "rgba(46,32,20,0.7)",
  },
  rowLabel: { fontFamily: pixelFont, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginBottom: 4 },
  rowText: { color: "#F1F5F9", fontSize: 12, lineHeight: 17, fontWeight: "700" },
});
