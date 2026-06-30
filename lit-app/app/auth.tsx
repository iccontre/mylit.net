import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { uiAssets } from "../constants/uiAssets";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";
import {
  getOrCreateProfile,
  getSession,
  isLocalOnboardingComplete,
  isProfileComplete,
  isSupabaseConfigured,
  signInWithEmail,
  signUpWithEmail,
} from "../lib/auth";
import { markWelcomeSeen, resolvePostAuthRoute } from "../lib/authFlow";

const APP_FRAME_ASPECT_RATIO = 1024 / 1792;
const MAX_FRAME_WIDTH = 520;

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

export default function AuthScreen() {
  const router = useRouter();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const supabaseReady = isSupabaseConfigured();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUpMode, setIsSignUpMode] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const safeViewportWidth = Math.max(0, viewportWidth - 24);
  const safeViewportHeight = Math.max(0, viewportHeight - 24);
  const frameWidth = Math.min(
    MAX_FRAME_WIDTH,
    safeViewportWidth,
    safeViewportHeight * APP_FRAME_ASPECT_RATIO
  );
  const frameHeight = frameWidth / APP_FRAME_ASPECT_RATIO;

  async function routeAfterAuth() {
    const profile = await getOrCreateProfile();
    if (!isProfileComplete(profile)) {
      router.replace("/profile-setup");
      return;
    }
    router.replace(await resolvePostAuthRoute());
  }

  async function handleAuth(mode: "signUp" | "signIn") {
    setError("");
    setMessage("");
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Add your email and password to continue.");
      return;
    }

    setBusy(true);
    const result =
      mode === "signUp"
        ? await signUpWithEmail(trimmedEmail, password)
        : await signInWithEmail(trimmedEmail, password);
    setBusy(false);

    if (!result.ok) {
      setError(result.error ?? "Could not complete sign in.");
      return;
    }

    const session = await getSession();
    if (!session) {
      setMessage("Check your email to confirm your account, then sign in.");
      setIsSignUpMode(false);
      return;
    }

    setMessage(mode === "signUp" ? "Account created. Setting up your profile..." : "Welcome back.");
    if (mode === "signUp") {
      void trackEvent(ANALYTICS_EVENTS.signup_completed);
    }
    await routeAfterAuth();
  }

  async function handleContinueOffline() {
    await markWelcomeSeen();
    const onboardingDone = await isLocalOnboardingComplete();
    router.replace(onboardingDone ? "/(tabs)" : "/onboarding");
  }

  return (
    <View style={styles.pageRoot}>
      <View style={[styles.phoneStage, { width: frameWidth, height: frameHeight }]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image
            source={uiAssets.backgrounds.neutral}
            style={styles.backgroundImage}
            resizeMode="cover"
          />
        </View>

        <ScrollView
          style={styles.screenScroller}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Image source={uiAssets.logo.mylit} style={styles.logo} resizeMode="contain" />

          <View style={styles.heroPanel}>
            <Text style={styles.heroTitle}>MYLIT</Text>
            <Text style={styles.heroSubtitle}>
              {isSignUpMode ? "Start your beta journey" : "Welcome back, traveler"}
            </Text>
          </View>

          {!supabaseReady ? (
            <View style={styles.fallbackPanel}>
              <Text style={styles.fallbackTitle}>Local beta mode</Text>
              <Text style={styles.fallbackText}>
                Supabase env vars are not set, so account sign-in is unavailable in this build.
                You can still use MYLIT offline with your existing local progress.
              </Text>
              <TouchableOpacity style={styles.offlineButton} onPress={handleContinueOffline}>
                <Text style={styles.offlineButtonText}>CONTINUE OFFLINE</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.formPanel}>
                <Text style={styles.supportCopy}>
                  One honest account keeps your beta profile and progress connected.
                </Text>

                <Text style={styles.fieldLabel}>EMAIL</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="you@example.com"
                  placeholderTextColor="#64748B"
                />

                <Text style={styles.fieldLabel}>PASSWORD</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder="••••••••"
                  placeholderTextColor="#64748B"
                />

                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                {message ? <Text style={styles.messageText}>{message}</Text> : null}

                <TouchableOpacity
                  style={[styles.primaryButton, busy && styles.buttonDisabled]}
                  onPress={() => handleAuth(isSignUpMode ? "signUp" : "signIn")}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator color="#FFF8E6" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {isSignUpMode ? "SIGN UP" : "SIGN IN"}
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    setIsSignUpMode((current) => !current);
                    setError("");
                    setMessage("");
                  }}
                  disabled={busy}
                >
                  <Text style={styles.secondaryButtonText}>
                    {isSignUpMode ? "Already have an account?" : "New to MYLIT?"}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: {
    flex: 1,
    backgroundColor: "#0E0703",
    alignItems: "center",
    justifyContent: "center",
  },
  phoneStage: {
    alignSelf: "center",
    backgroundColor: "#0A1A0C",
    overflow: "hidden",
    position: "relative",
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
    paddingTop: 24,
    paddingBottom: 28,
  },
  logo: {
    width: "68%",
    height: 56,
    alignSelf: "center",
    marginBottom: 12,
  },
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
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 2,
  },
  heroSubtitle: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 6,
    textAlign: "center",
  },
  formPanel: {
    backgroundColor: "rgba(15, 23, 42, 0.86)",
    borderWidth: 2,
    borderColor: "#D99A16",
    borderRadius: 8,
    padding: 14,
  },
  supportCopy: {
    color: "#CBD5E1",
    fontFamily: readableFont,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginBottom: 12,
    textAlign: "center",
  },
  fieldLabel: {
    color: "#9BE331",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    minHeight: 44,
    backgroundColor: "rgba(2, 6, 23, 0.9)",
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 6,
    color: "#F8FAFC",
    fontFamily: readableFont,
    fontSize: 15,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  primaryButton: {
    minHeight: 50,
    backgroundColor: "#14532D",
    borderWidth: 3,
    borderColor: "#F3B32B",
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: "#FFF8E6",
    fontFamily: pixelFont,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1,
  },
  secondaryButton: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 12,
    fontWeight: "900",
  },
  errorText: {
    color: "#FCA5A5",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 8,
    lineHeight: 16,
  },
  messageText: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 8,
    lineHeight: 16,
  },
  fallbackPanel: {
    backgroundColor: "rgba(15, 23, 42, 0.9)",
    borderWidth: 2,
    borderColor: "#D99A16",
    borderRadius: 8,
    padding: 14,
  },
  fallbackTitle: {
    color: "#FDE047",
    fontFamily: pixelFont,
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 8,
    textAlign: "center",
  },
  fallbackText: {
    color: "#CBD5E1",
    fontFamily: readableFont,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    textAlign: "center",
    marginBottom: 14,
  },
  offlineButton: {
    minHeight: 48,
    backgroundColor: "#1E293B",
    borderWidth: 2,
    borderColor: "#22C55E",
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  offlineButtonText: {
    color: "#9BE331",
    fontFamily: pixelFont,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
});
