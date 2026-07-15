import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { accentByParchmentAccent, parchmentBody, parchmentBorder, parchmentGeometry, parchmentInk, parchmentInkMuted, type ParchmentAccent } from "../../constants/parchmentTokens";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

export type { ParchmentAccent };

type ParchmentSurfaceProps = {
  accent?: ParchmentAccent;
  /** Small uppercase eyebrow above the title. */
  kicker?: string;
  title?: string;
  /** Right-aligned short label next to the title (e.g. a badge, count, or time). */
  trailingLabel?: string;
  /** Renders a colored strip along the left edge instead of a top strip. */
  edgeStrip?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/**
 * The one shared parchment content container — parchment fill, brown border, rounded corners,
 * hard pixel shadow, optional accent strip/kicker/title/trailing label. Height is always
 * content-driven (no fixed heights that could clip text) — pass style overrides for spacing
 * only, never to force a height.
 */
export function ParchmentSurface({ accent = "neutral", kicker, title, trailingLabel, edgeStrip, style, children }: ParchmentSurfaceProps) {
  const accentColor = accentByParchmentAccent[accent];

  return (
    <View style={[styles.surface, edgeStrip ? { borderLeftWidth: 6, borderLeftColor: accentColor } : null, style]}>
      {!edgeStrip ? <View style={[styles.topStrip, { backgroundColor: accentColor }]} /> : null}
      {kicker || title || trailingLabel ? (
        <View style={styles.headerRow}>
          <View style={styles.headerTextCol}>
            {kicker ? <Text style={[styles.kicker, { color: accentColor }]}>{kicker}</Text> : null}
            {title ? <Text style={styles.title}>{title}</Text> : null}
          </View>
          {trailingLabel ? <Text style={[styles.trailingLabel, { color: accentColor }]}>{trailingLabel}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: parchmentBody,
    borderWidth: parchmentGeometry.surfaceBorderWidth,
    borderColor: parchmentBorder,
    borderRadius: parchmentGeometry.surfaceRadius,
    padding: 12,
    overflow: "hidden",
    ...parchmentGeometry.hardShadow,
  },
  topStrip: { height: 5, marginHorizontal: -12, marginTop: -12, marginBottom: 10 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, gap: 8 },
  headerTextCol: { flex: 1 },
  kicker: { fontFamily: pixelFont, fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 },
  title: { fontFamily: pixelFont, fontSize: 15, fontWeight: "900", color: parchmentInk, lineHeight: 20 },
  trailingLabel: { fontFamily: pixelFont, fontSize: 11, fontWeight: "900" },
});

export const parchmentTextStyles = StyleSheet.create({
  body: { fontFamily: pixelFont, fontSize: 12, fontWeight: "700", color: parchmentInk, lineHeight: 17 },
  meta: { fontFamily: pixelFont, fontSize: 10, fontWeight: "800", color: parchmentInkMuted },
});
