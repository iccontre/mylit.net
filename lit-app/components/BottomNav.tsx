import { useRouter } from "expo-router";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { BOTTOM_NAV_HEIGHT } from "../constants/mobileLayout";

export type BottomNavRoute = "home" | "sleep" | "mind" | "path" | "calendar" | "stats";
export type BottomNavTheme = "gold" | "purple";

type BottomNavProps = {
  activeRoute: BottomNavRoute;
  theme?: BottomNavTheme;
  bottomOffset?: number;
};

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

const ROUTES: { key: BottomNavRoute; href: string; icon: string; label: string }[] = [
  { key: "home", href: "/", icon: "🏠", label: "HOME" },
  { key: "sleep", href: "/sleep", icon: "🌙", label: "SLEEP" },
  { key: "mind", href: "/mind", icon: "🧠", label: "MIND" },
  { key: "path", href: "/path", icon: "🌲", label: "PATH" },
  { key: "calendar", href: "/calendar", icon: "📅", label: "CAL" },
  { key: "stats", href: "/stats", icon: "🎒", label: "BAG" },
];

export function BottomNav({ activeRoute, theme = "gold", bottomOffset = 8 }: BottomNavProps) {
  const router = useRouter();
  const accent = theme === "purple" ? "#A78BFA" : "#FBBF24";
  const activeGlow = theme === "purple" ? "#FDE68A" : "#86EFAC";
  const activeBg = theme === "purple" ? "#1E1B4B" : "#162314";
  const activeBorder = theme === "purple" ? "#FDE68A" : accent;

  return (
    <View style={[styles.bottomNav, { borderColor: accent, bottom: bottomOffset }]}>
      {ROUTES.map((route) => {
        const active = route.key === activeRoute;
        return (
          <TouchableOpacity
            key={route.key}
            style={[
              styles.navButton,
              active && { backgroundColor: activeBg, borderColor: activeBorder },
            ]}
            onPress={() => router.push(route.href as "/")}
          >
            <Text style={[styles.navIcon, active && { color: activeGlow }]}>{route.icon}</Text>
            <Text style={[styles.navLabel, active && { color: activeGlow }]}>{route.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    position: "absolute",
    left: 8,
    right: 8,
    height: BOTTOM_NAV_HEIGHT,
    backgroundColor: "rgba(4, 8, 16, 0.98)",
    borderWidth: 3,
    borderRadius: 5,
    padding: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  navButton: {
    flex: 1,
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#3A4558",
    borderRadius: 3,
    paddingVertical: 4,
    marginHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  navIcon: {
    color: "#E2E8F0",
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 20,
  },
  navLabel: {
    color: "#94A3B8",
    fontFamily: pixelFont,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.4,
    marginTop: 1,
  },
});
