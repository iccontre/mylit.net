import { useRouter } from "expo-router";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { BOTTOM_NAV_HEIGHT } from "../constants/mobileLayout";
import { hubPalettes, woodBorder, woodVoid } from "../constants/worldTokens";

export type BottomNavRoute = "home" | "sleep" | "mind" | "path" | "calendar" | "stats";
/** @deprecated Kept only so older call sites still type-check; BottomNav now derives its
 *  selected-tab color from `activeRoute` (see ROUTE_ACCENTS) and, for "home", from
 *  `homeAccent` — a page-wide theme string can no longer disagree with the route it's on. */
export type BottomNavTheme = "gold" | "purple";

type BottomNavProps = {
  activeRoute: BottomNavRoute;
  /** Home's selected-tab color follows the LIVE energy mode (see BOTTOM NAV STATES reference:
   *  "HOME · current mode color") — pass the current mode's accent hex when activeRoute="home".
   *  Ignored for every other route, which each have one fixed hub color. */
  homeAccent?: string;
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

/** Fixed per-tab selected color, straight from the rendered "BOTTOM NAV STATES" reference frame
 *  ("SLEEP · lavender", "MIND · violet", "PATH · green", "CAL · red/gold", "BAG · white/gold"). */
const ROUTE_ACCENTS: Record<Exclude<BottomNavRoute, "home">, string> = {
  sleep: hubPalettes.sleep.accent,
  mind: hubPalettes.mind.accent,
  path: hubPalettes.path.accent,
  calendar: hubPalettes.calendar.accent,
  stats: hubPalettes.stats.accent,
};

export function BottomNav({ activeRoute, homeAccent, bottomOffset = 8 }: BottomNavProps) {
  const router = useRouter();

  return (
    <View style={[styles.bottomNav, { bottom: bottomOffset }]}>
      {ROUTES.map((route) => {
        const active = route.key === activeRoute;
        const accent = route.key === "home" ? homeAccent ?? hubPalettes.neutral.accent : ROUTE_ACCENTS[route.key];
        return (
          <TouchableOpacity
            key={route.key}
            style={[styles.navButton, active && { borderColor: accent, backgroundColor: "rgba(0,0,0,0.25)" }]}
            onPress={() => router.push(route.href as "/")}
          >
            <Text style={[styles.navIcon, active && { color: accent }]}>{route.icon}</Text>
            <Text style={[styles.navLabel, active && { color: accent }]}>{route.label}</Text>
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
    backgroundColor: woodVoid,
    borderWidth: 3,
    borderColor: woodBorder,
    borderRadius: 5,
    padding: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  navButton: {
    flex: 1,
    backgroundColor: "#3E2A1A",
    borderWidth: 2,
    borderColor: "#5C4425",
    borderRadius: 3,
    paddingVertical: 4,
    marginHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  navIcon: {
    color: "#F5EFE2",
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 20,
  },
  navLabel: {
    color: "#D8C9A3",
    fontFamily: pixelFont,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.4,
    marginTop: 1,
  },
});
