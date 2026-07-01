import { Image, ImageSourcePropType, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

type Props = {
  visible: boolean;
  onClose: () => void;
  guideAvatar: ImageSourcePropType;
  guideName: string;
  title: string;
  bullets: string[];
  accentColor?: string;
};

export function GuideInfoModal({ visible, onClose, guideAvatar, guideName, title, bullets, accentColor = "#A78BFA" }: Props) {
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <View style={[styles.card, { borderColor: accentColor }]}>
        <View style={styles.header}>
          <Image source={guideAvatar} style={[styles.avatar, { borderColor: accentColor }]} resizeMode="contain" />
          <View style={styles.headerCopy}>
            <Text style={[styles.guideName, { color: accentColor }]}>{guideName}</Text>
            <Text style={styles.title}>{title}</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} bounces={false}>
          {bullets.map((bullet, i) => (
            <View key={i} style={styles.bulletRow}>
              <Text style={[styles.bullet, { color: accentColor }]}>›</Text>
              <Text style={styles.bulletText}>{bullet}</Text>
            </View>
          ))}
        </ScrollView>
        <TouchableOpacity style={[styles.closeBtn, { borderColor: accentColor }]} onPress={onClose}>
          <Text style={styles.closeBtnText}>RETURN</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.78)",
    justifyContent: "center",
    padding: 16,
    zIndex: 20,
  },
  card: {
    backgroundColor: "rgba(8,13,24,0.99)",
    borderWidth: 3,
    borderRadius: 10,
    padding: 16,
    maxHeight: "86%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    backgroundColor: "rgba(21,16,48,0.72)",
    marginRight: 12,
  },
  headerCopy: {
    flex: 1,
  },
  guideName: {
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  title: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 21,
  },
  divider: {
    height: 2,
    backgroundColor: "#1F2937",
    marginBottom: 12,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: 320,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 9,
  },
  bullet: {
    fontFamily: pixelFont,
    fontSize: 15,
    fontWeight: "900",
    marginRight: 8,
    lineHeight: 20,
  },
  bulletText: {
    flex: 1,
    color: "#E5E7EB",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 19,
  },
  closeBtn: {
    backgroundColor: "rgba(49,46,129,0.92)",
    borderWidth: 2,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 14,
    borderRadius: 6,
  },
  closeBtnText: {
    color: "#F9FAFB",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
});
