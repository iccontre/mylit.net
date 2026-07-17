import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { hubPalettes, type HubKey } from "../../constants/worldTokens";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

type WorldChromeProps = {
  hub: HubKey;
  /** Small uppercase eyebrow above the title (e.g. "MOONLIT REST", "SCHEDULE BOARD"). */
  kicker: string;
  title: string;
  subtitle?: string;
  /** Extra line below the subtitle — e.g. Calendar's "JUL 6 - JUL 12, 2026" date range. */
  extra?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The one shared page-header banner ("WorldChrome") — replaces every old navy title header.
 * Hub-colored fill/border with four pixel corner-dots, matching the rendered World System
 * banners (Sleep/Mind/Path/Calendar/Stats hub pages and Home's guide-message equivalent).
 */
export function WorldChrome({ hub, kicker, title, subtitle, extra, style }: WorldChromeProps) {
  const palette = hubPalettes[hub];

  return (
    <View style={[styles.banner, { backgroundColor: palette.chrome, borderColor: palette.edge }, style]}>
      <View style={[styles.dot, styles.dotTopLeft, { backgroundColor: palette.text }]} />
      <View style={[styles.dot, styles.dotTopRight, { backgroundColor: palette.text }]} />
      <View style={[styles.dot, styles.dotBottomLeft, { backgroundColor: palette.text }]} />
      <View style={[styles.dot, styles.dotBottomRight, { backgroundColor: palette.text }]} />
      <Text style={[styles.kicker, { color: palette.accent }]}>{kicker}</Text>
      <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: palette.text }]}>{subtitle}</Text> : null}
      {extra ? <Text style={[styles.extra, { color: palette.accent }]}>{extra}</Text> : null}
    </View>
  );
}

const DOT_SIZE = 6;
const DOT_INSET = 10;

const styles = StyleSheet.create({
  banner: {
    borderWidth: 3,
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  dot: { position: "absolute", width: DOT_SIZE, height: DOT_SIZE, opacity: 0.55 },
  dotTopLeft: { top: DOT_INSET, left: DOT_INSET },
  dotTopRight: { top: DOT_INSET, right: DOT_INSET },
  dotBottomLeft: { bottom: DOT_INSET, left: DOT_INSET },
  dotBottomRight: { bottom: DOT_INSET, right: DOT_INSET },
  kicker: { fontFamily: pixelFont, fontSize: 11, fontWeight: "900", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 },
  title: { fontFamily: pixelFont, fontSize: 30, fontWeight: "900", letterSpacing: 1, textAlign: "center" },
  subtitle: { fontFamily: pixelFont, fontSize: 13, fontWeight: "700", textAlign: "center", marginTop: 8, opacity: 0.92 },
  extra: { fontFamily: pixelFont, fontSize: 11, fontWeight: "900", textAlign: "center", marginTop: 4, letterSpacing: 0.5 },
});
