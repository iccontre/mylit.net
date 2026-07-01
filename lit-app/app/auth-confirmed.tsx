import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { FormScreen } from "../components/FormScreen";
import { formPageContent } from "../constants/formStyles";
import { useMobileFrame } from "../constants/mobileLayout";
import { uiAssets } from "../constants/uiAssets";
import { getSession, isOnboardingComplete, prepareReturningUserAfterSync } from "../lib/auth";
import { consumeAuthCallbackFromUrl } from "../lib/authEmailConfirm";
import { mergeCloudIntoLocalSafely } from "../lib/progressStore";
import {
  clearAuthAwaitingContinue,
  clearAuthPendingEmailConfirm,
  isAuthAwaitingContinue,
  markAuthAwaitingContinue,
  markWelcomeSeen,
} from "../lib/authFlow";
import { isSupabaseConfigured } from "../lib/supabase";

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

export default function AuthConfirmedScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [readyToContinue, setReadyToContinue] = useState(false);

  useEffect(() => {
    void (async () => {
      if (!isSupabaseConfigured()) {
        setLoading(false);
        return;
      }

      const sessionFromCallback = await consumeAuthCallbackFromUrl();
      const session = (await getSession()) ?? null;
      const signedIn = Boolean(session);

      if (signedIn) {
        await markAuthAwaitingContinue();
        await clearAuthPendingEmailConfirm();
        await markWelcomeSeen();
      }

      const awaiting = await isAuthAwaitingContinue();
      setHasSession(signedIn);
      setReadyToContinue(signedIn && awaiting);
      setLoading(false);

      if (!signedIn && sessionFromCallback) {
        // Callback was present but session did not stick — user still confirmed in email.
        setReadyToContinue(false);
      }
    })();
  }, []);

  async function handleContinueToMylit() {
    setLoading(true);
    try {
      await mergeCloudIntoLocalSafely();
      await clearAuthAwaitingContinue();
      const profile = await prepareReturningUserAfterSync();
      await markWelcomeSeen();
      const onboardingDone = await isOnboardingComplete(profile);
      router.replace(onboardingDone ? "/(tabs)" : "/onboarding");
    } finally {
      setLoading(false);
    }
  }

  function handleReturnToSignIn() {
    router.replace("/auth");
  }

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image source={uiAssets.backgrounds.neutral} style={styles.backgroundImage} resizeMode="cover" />
        </View>

        <FormScreen scrollPaddingBottom={mobile.formScrollPaddingBottom} contentContainerStyle={[formPageContent, styles.content]}>
          <Image source={uiAssets.logo.mylit} style={styles.logo} resizeMode="contain" />

          <View style={styles.heroPanel}>
            <Text style={styles.heroTitle}>EMAIL CONFIRMED</Text>
            <Text style={styles.heroSubtitle}>One more step in MYLIT</Text>
          </View>

          {loading ? (
            <View style={styles.panel}>
              <ActivityIndicator color="#9BE331" size="large" />
            </View>
          ) : readyToContinue ? (
            <View style={styles.panel}>
              <Text style={styles.successTitle}>You're verified.</Text>
              <Text style={styles.bodyText}>
                Your email is confirmed. Return to the MYLIT app if you opened this link in Safari, then tap Continue
                below to finish setup.
              </Text>
              <Text style={styles.hintText}>
                Your progress syncs to your account so you can continue on any device.
              </Text>
              <TouchableOpacity style={styles.primaryButton} onPress={handleContinueToMylit}>
                <Text style={styles.primaryButtonText}>CONTINUE TO MYLIT</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.panel}>
              <Text style={styles.successTitle}>Email confirmed.</Text>
              <Text style={styles.bodyText}>
                Return to the MYLIT app on your Home Screen. Sign in with the same email and password, then tap
                Continue to MYLIT.
              </Text>
              <Text style={styles.hintText}>
                {hasSession
                  ? "If Continue does not appear after sign-in, reopen MYLIT from your Home Screen."
                  : "Safari and the Home Screen app keep separate sessions — signing in once in MYLIT connects your account."}
              </Text>
              <TouchableOpacity style={styles.primaryButton} onPress={handleReturnToSignIn}>
                <Text style={styles.primaryButtonText}>RETURN TO MYLIT SIGN IN</Text>
              </TouchableOpacity>
            </View>
          )}
        </FormScreen>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: { flex: 1, backgroundColor: "#0E0703" },
  phoneStage: { alignSelf: "center", backgroundColor: "#0A1A0C", overflow: "hidden", position: "relative" },
  phoneStageFullscreen: { borderWidth: 0, shadowOpacity: 0 },
  backgroundLayer: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  backgroundImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  content: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 28, zIndex: 1 },
  logo: { width: "68%", height: 56, alignSelf: "center", marginBottom: 12 },
  heroPanel: {
    backgroundColor: "rgba(10, 26, 12, 0.9)",
    borderWidth: 2,
    borderColor: "#22C55E",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 14,
    alignItems: "center",
  },
  heroTitle: {
    color: "#9BE331",
    fontFamily: pixelFont,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 1.5,
    textAlign: "center",
  },
  heroSubtitle: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 6,
    textAlign: "center",
  },
  panel: {
    backgroundColor: "rgba(15, 23, 42, 0.9)",
    borderWidth: 2,
    borderColor: "#22C55E",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  successTitle: {
    color: "#9BE331",
    fontFamily: pixelFont,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 10,
    textAlign: "center",
  },
  bodyText: {
    color: "#CBD5E1",
    fontFamily: readableFont,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 10,
  },
  hintText: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 15,
    textAlign: "center",
    marginBottom: 14,
  },
  primaryButton: {
    minHeight: 50,
    width: "100%",
    backgroundColor: "#14532D",
    borderWidth: 3,
    borderColor: "#F3B32B",
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#FFF8E6",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.8,
    textAlign: "center",
  },
});
