import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { woodBorder, woodSurface } from "../../constants/worldTokens";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

type WoodSurfaceProps = {
  /** Optional header row (icon + label), e.g. "PATH MILESTONES". Header text uses `accent`. */
  title?: string;
  icon?: string;
  accent?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/**
 * Dark wood-brown surface — Path milestones, Calendar timeline/scheduler, quest/checklist
 * editor forms, history groupings. Distinct from ParchmentSurface (cream, for saved content)
 * and WorldChrome (hub-colored, for page headers).
 */
export function WoodSurface({ title, icon, accent = "#FBBF24", style, children }: WoodSurfaceProps) {
  return (
    <View style={[styles.surface, style]}>
      {title ? (
        <View style={styles.header}>
          {icon ? <Text style={styles.headerIcon}>{icon}</Text> : null}
          <Text style={[styles.headerText, { color: accent }]}>{title}</Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: woodSurface,
    borderWidth: 3,
    borderColor: woodBorder,
    borderRadius: 8,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  headerIcon: { fontSize: 15 },
  headerText: { fontFamily: pixelFont, fontSize: 12, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },
});
