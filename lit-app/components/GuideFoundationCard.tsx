import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { buildAgentContextSnapshot } from "../lib/mylitAgents";
import type { AgentContextSnapshot } from "../lib/agentTypes";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

/**
 * Small, non-technical preview of MYLIT's guide-foundation layer (see
 * .agent/docs/MYLIT_AGENT_ARCHITECTURE.md). Everything shown here is computed locally by
 * deterministic helpers in lib/mylitAgents.ts — no AI call, no health permission, nothing
 * sent anywhere. Safe to render even for a user who has entered no life-profile data yet.
 */
export function GuideFoundationCard() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<AgentContextSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    void buildAgentContextSnapshot().then((next) => {
      if (!cancelled) setSnapshot(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!snapshot) return null;

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>✦ MYLIT GUIDE FOUNDATION</Text>

      <View style={[styles.row, { borderColor: "#FBBF24" }]}>
        <Text style={[styles.rowLabel, { color: "#FDE68A" }]}>EVIE</Text>
        <Text style={styles.rowText}>{snapshot.evie.headline}</Text>
        {snapshot.evie.supportingLines.map((line, index) => (
          <Text key={index} style={styles.rowSubText}>· {line}</Text>
        ))}
      </View>

      <View style={[styles.row, { borderColor: "#A78BFA" }]}>
        <Text style={[styles.rowLabel, { color: "#E9D5FF" }]}>LUNA</Text>
        <Text style={styles.rowText}>{snapshot.luna.headline}</Text>
        {snapshot.luna.supportingLines.map((line, index) => (
          <Text key={index} style={styles.rowSubText}>· {line}</Text>
        ))}
      </View>

      <View style={[styles.row, { borderColor: "#38BDF8" }]}>
        <Text style={[styles.rowLabel, { color: "#BAE6FD" }]}>STATS</Text>
        <Text style={styles.rowText}>
          {snapshot.insights.length > 0
            ? "Stats is quietly learning from your patterns and helping Evie and Luna adjust your plan."
            : "Stats will quietly learn from your patterns and help Evie and Luna adjust your plan."}
        </Text>
        {snapshot.insights.slice(0, 2).map((insight) => (
          <Text key={insight.id} style={styles.rowSubText}>· {insight.summary}</Text>
        ))}
      </View>

      <View style={[styles.row, { borderColor: "#475569" }]}>
        <Text style={[styles.rowLabel, { color: "#CBD5E1" }]}>BIOMARKERS</Text>
        <Text style={styles.rowText}>
          {snapshot.latestBiomarker
            ? "Manual check-ins only — health data is not connected yet."
            : "Health data is not connected yet. Future versions may let you opt in to Apple Health or wearable data."}
        </Text>
      </View>

      <TouchableOpacity style={styles.editButton} onPress={() => router.push("/life-profile")}>
        <Text style={styles.editButtonText}>✎ EDIT LIFE PROFILE</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: "rgba(8, 13, 24, 0.95)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: "#334155",
  },
  panelTitle: {
    color: "#FDE047",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.5,
    textAlign: "center",
    marginBottom: 10,
  },
  row: {
    borderWidth: 2,
    borderRadius: 6,
    padding: 9,
    marginBottom: 8,
    backgroundColor: "rgba(15,23,42,0.7)",
  },
  rowLabel: {
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 4,
  },
  rowText: {
    color: "#F1F5F9",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  rowSubText: {
    color: "#94A3B8",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    marginTop: 4,
  },
  editButton: {
    borderWidth: 2,
    borderColor: "#FBBF24",
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "rgba(69,43,8,0.4)",
  },
  editButtonText: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
});
