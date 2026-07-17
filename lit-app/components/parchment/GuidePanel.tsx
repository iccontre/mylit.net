import { Image, type ImageSourcePropType, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { hubPalettes, type HubKey } from "../../constants/worldTokens";

const pixelFont = Platform.select({ ios: "Menlo", android: "monospace", web: "monospace", default: "monospace" });

type GuidePanelProps = {
  hub: HubKey;
  guideName: string;
  guideAvatar: ImageSourcePropType;
  message: string;
  onInfoPress?: () => void;
};

/**
 * Guide Magic tier — the one shared Luna/Evie message panel (replaces every ad-hoc inline guide
 * card). Colored to the CURRENT hub, not a fixed per-guide color — the rendered World System
 * shows Evie's Path panel in green and Luna's Sleep/Mind panels in purple, i.e. always the
 * hub's own palette, never a guide-branded override.
 */
export function GuidePanel({ hub, guideName, guideAvatar, message, onInfoPress }: GuidePanelProps) {
  const palette = hubPalettes[hub];

  return (
    <View style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.edge }]}>
      <Image source={guideAvatar} style={[styles.avatar, { borderColor: palette.edge }]} resizeMode="contain" />
      <View style={styles.textCol}>
        <Text style={[styles.name, { color: palette.accent }]}>{guideName} ♥</Text>
        <Text style={[styles.message, { color: palette.text }]}>{message}</Text>
      </View>
      {onInfoPress ? (
        <TouchableOpacity style={[styles.infoBtn, { borderColor: palette.edge }]} onPress={onInfoPress} accessibilityLabel="How this works">
          <Text style={[styles.infoBtnText, { color: palette.accent }]}>?</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 3,
    borderRadius: 8,
    padding: 13,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 },
  },
  avatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 3, backgroundColor: "rgba(0,0,0,0.25)" },
  textCol: { flex: 1 },
  name: { fontFamily: pixelFont, fontSize: 13, fontWeight: "900", letterSpacing: 0.5, marginBottom: 4, textTransform: "uppercase" },
  message: { fontFamily: pixelFont, fontSize: 13, fontWeight: "700", lineHeight: 19 },
  infoBtn: { width: 32, height: 32, borderRadius: 5, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  infoBtnText: { fontFamily: pixelFont, fontSize: 15, fontWeight: "900" },
});
