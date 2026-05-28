import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { GOAL_HORIZON_LABELS } from "../constants/goalMilestoneTemplates";

type UserProfile = {
  name: string;
  longTermDream?: string;
  dreamCategory?: string;
  progressMeaning: string;
  // Phase 1 tiered goals
  specificGoal?: string;
  shortTermGoal?: string;
  midTermGoal?: string;
  longTermGoal?: string;
  // Legacy flat fields, kept for backward compat with older saved profiles
  goalOne?: string;
  goalTwo?: string;
  goalThree?: string;
  biggestObstacle?: string;
  hasWorkOrSchool?: boolean;
  hasTransportation?: boolean;
  hasGymAccess?: boolean;
  hasQuietSpace?: boolean;
  hasFoodControl?: boolean;
};

const PROFILE_KEY = "lit_user_profile";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

type NavItem = {
  label: string;
  icon: string;
  route: "/" | "/sleep" | "/calendar" | "/mind" | "/path" | "/stats";
};

const NAV_ITEMS: NavItem[] = [
  { label: "Home", icon: "🏠", route: "/" },
  { label: "Sleep", icon: "🌙", route: "/sleep" },
  { label: "Calendar", icon: "📅", route: "/calendar" },
  { label: "Mind", icon: "🧠", route: "/mind" },
  { label: "Path", icon: "🧭", route: "/path" },
  { label: "Stats", icon: "📊", route: "/stats" },
];

export default function PathScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const saved = await AsyncStorage.getItem(PROFILE_KEY);
    if (saved) {
      setProfile(JSON.parse(saved));
    }
  }

  const longTermDream = profile?.longTermDream?.trim() || "Not set yet";
  const dreamCategory = profile?.dreamCategory?.trim() || "Not set yet";
  const specificGoal = profile?.specificGoal?.trim() || "";
  // Prefer the new tiered fields, fall back to legacy goalOne / Two / Three
  // for users whose profile was saved before the tiered flow existed.
  const shortTermGoal =
    profile?.shortTermGoal?.trim() || profile?.goalOne?.trim() || "Not set yet";
  const midTermGoal =
    profile?.midTermGoal?.trim() || profile?.goalTwo?.trim() || "Not set yet";
  const longTermGoal =
    profile?.longTermGoal?.trim() || profile?.goalThree?.trim() || "Not set yet";
  const progressMeaning = profile?.progressMeaning?.trim() || "Not set yet";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.shell}>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>PATH BOARD</Text>
          <Text style={styles.title}>PATH</Text>
          <Text style={styles.subtitle}>Keep your direction visible and update it when life changes.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>LONG-TERM DREAM</Text>
          <Text style={styles.cardMain}>{longTermDream}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>DREAM CATEGORY</Text>
          <Text style={styles.cardText}>{dreamCategory}</Text>
        </View>

        {specificGoal ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>SPECIFIC GOAL</Text>
            <Text style={styles.cardText}>{specificGoal}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>PATH MILESTONES</Text>

          <View style={styles.milestoneRow}>
            <View style={styles.milestoneHeaderRow}>
              <Text style={styles.milestoneLabel}>{GOAL_HORIZON_LABELS.shortTerm.label}</Text>
              <Text style={styles.milestoneCaption}>{GOAL_HORIZON_LABELS.shortTerm.caption}</Text>
            </View>
            <Text style={styles.goalText}>{shortTermGoal}</Text>
          </View>

          <View style={styles.milestoneRow}>
            <View style={styles.milestoneHeaderRow}>
              <Text style={styles.milestoneLabel}>{GOAL_HORIZON_LABELS.midTerm.label}</Text>
              <Text style={styles.milestoneCaption}>{GOAL_HORIZON_LABELS.midTerm.caption}</Text>
            </View>
            <Text style={styles.goalText}>{midTermGoal}</Text>
          </View>

          <View style={styles.milestoneRow}>
            <View style={styles.milestoneHeaderRow}>
              <Text style={styles.milestoneLabel}>{GOAL_HORIZON_LABELS.longTerm.label}</Text>
              <Text style={styles.milestoneCaption}>{GOAL_HORIZON_LABELS.longTerm.caption}</Text>
            </View>
            <Text style={styles.goalText}>{longTermGoal}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>PROGRESS MEANING</Text>
          <Text style={styles.cardText}>{progressMeaning}</Text>
        </View>

        <TouchableOpacity style={styles.actionButton} onPress={() => router.push("/onboarding")}>
          <Text style={styles.actionButtonText}>Set My Path</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.secondaryActionButton]}
          onPress={() => router.push("/next-chapter")}
        >
          <Text style={styles.actionButtonText}>Set Your Next Long-Term Goal</Text>
        </TouchableOpacity>

        <View style={styles.bottomNav}>
          <Text style={styles.bottomTitle}>NAVIGATION</Text>
          <View style={styles.navGrid}>
            {NAV_ITEMS.map((item) => {
              const isActive = item.route === "/path";
              return (
                <TouchableOpacity
                  key={item.route}
                  style={[styles.navButton, isActive && styles.navButtonActive]}
                  onPress={() => router.push(item.route)}
                >
                  <Text style={[styles.navText, isActive && styles.navTextActive]}>
                    {item.icon} {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0B1220",
  },
  container: {
    paddingTop: 28,
    paddingBottom: 42,
  },
  shell: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 18,
  },
  hero: {
    backgroundColor: "#0F1E1A",
    borderWidth: 3,
    borderColor: "#FBBF24",
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
  },
  heroLabel: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: "800",
    marginBottom: 8,
  },
  title: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 8,
  },
  subtitle: {
    color: "#D1FAE5",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  cardLabel: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  cardMain: {
    color: "#F9FAFB",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
  },
  cardText: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 20,
  },
  goalText: {
    color: "#E2E8F0",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
    fontWeight: "700",
  },
  milestoneRow: {
    marginTop: 4,
    marginBottom: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#1F2937",
  },
  milestoneHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  milestoneLabel: {
    color: "#FDE68A",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  milestoneCaption: {
    color: "#94A3B8",
    fontSize: 10,
    fontFamily: pixelFont,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  actionButton: {
    backgroundColor: "#166534",
    borderWidth: 2,
    borderColor: "#FBBF24",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
    alignItems: "center",
  },
  secondaryActionButton: {
    backgroundColor: "#0F172A",
    borderColor: "#22C55E",
  },
  actionButtonText: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  bottomNav: {
    backgroundColor: "#0F172A",
    borderWidth: 3,
    borderColor: "#334155",
    borderRadius: 18,
    padding: 12,
    marginTop: 6,
  },
  bottomTitle: {
    color: "#E2E8F0",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  navGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  navButton: {
    width: "48.5%",
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 8,
    alignItems: "center",
  },
  navButtonActive: {
    backgroundColor: "#14532D",
    borderColor: "#FBBF24",
  },
  navText: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  navTextActive: {
    color: "#FDE68A",
  },
});