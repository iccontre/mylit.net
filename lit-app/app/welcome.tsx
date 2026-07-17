import { useRouter } from "expo-router";
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { uiAssets } from "../constants/uiAssets";
import { useMobileFrame } from "../constants/mobileLayout";
import { markWelcomeSeen } from "../lib/authFlow";

const pixelFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "monospace",
  default: "monospace",
});

const readableFont = Platform.select({
  ios: "Arial",
  android: "sans-serif",
  web: "Arial",
  default: undefined,
});

export default function WelcomeScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();

  async function handleBegin() {
    await markWelcomeSeen();
    router.replace("/auth");
  }

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image
            source={uiAssets.backgrounds.default}
            style={styles.backgroundImage}
            resizeMode="cover"
          />
        </View>

        <ScrollView
          style={styles.screenScroller}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Image source={uiAssets.logo.mylit} style={styles.logo} resizeMode="contain" />

          <View style={styles.heroPanel}>
            <Text style={styles.heroTitle}>Welcome to MYLIT</Text>
            <Text style={styles.heroSubtitle}>Living in Truth</Text>
          </View>

          <View style={styles.copyPanel}>
            <Text style={styles.copyText}>
              MYLIT helps you turn sleep, energy, and small daily quests into real progress. It does
              not punish low-energy days. Recovery counts. Progress starts with one honest step.
            </Text>
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={handleBegin}>
            <Text style={styles.primaryButtonText}>BEGIN</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: {
    flex: 1,
    backgroundColor: "#0E0703",
  },
  phoneStage: {
    alignSelf: "center",
    backgroundColor: "#0A1A0C",
    overflow: "hidden",
    position: "relative",
  },
  phoneStageFullscreen: {
    borderWidth: 0,
    shadowOpacity: 0,
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  screenScroller: {
    flex: 1,
    zIndex: 1,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 32,
    flexGrow: 1,
    justifyContent: "center",
  },
  logo: {
    width: "72%",
    height: 62,
    alignSelf: "center",
    marginBottom: 18,
  },
  heroPanel: {
    backgroundColor: "rgba(10, 26, 12, 0.88)",
    borderWidth: 2,
    borderColor: "#22C55E",
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 14,
    alignItems: "center",
  },
  heroTitle: {
    color: "#9BE331",
    fontFamily: pixelFont,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 1.5,
    textAlign: "center",
    textShadowColor: "#052E16",
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 0,
  },
  heroSubtitle: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 6,
  },
  copyPanel: {
    backgroundColor: "rgba(46,32,20, 0.82)",
    borderWidth: 2,
    borderColor: "#D99A16",
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 22,
  },
  copyText: {
    color: "#F8FAFC",
    fontFamily: readableFont,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 21,
    textAlign: "center",
  },
  primaryButton: {
    minHeight: 54,
    backgroundColor: "#14532D",
    borderWidth: 4,
    borderColor: "#F3B32B",
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2B1403",
    shadowOpacity: 0.65,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  primaryButtonText: {
    color: "#FFF8E6",
    fontFamily: pixelFont,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
});
