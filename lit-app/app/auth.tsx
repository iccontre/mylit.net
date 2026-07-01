import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { FormScreen } from "../components/FormScreen";
import { formPageContent } from "../constants/formStyles";
import { useMobileFrame } from "../constants/mobileLayout";
import { uiAssets } from "../constants/uiAssets";
import { ANALYTICS_EVENTS, trackEvent } from "../lib/analytics";
import {
  getOrCreateProfile,
  getSession,
  isLocalOnboardingComplete,
  isOnboardingComplete,
  isSupabaseConfigured,
  signInWithEmail,
  signUpWithEmail,
} from "../lib/auth";
import { mergeCloudIntoLocalSafely } from "../lib/progressStore";
import { getSupabaseConfigHelp, getSupabaseConfigIssue, getSupabaseClient } from "../lib/supabase";
import {
  markWelcomeSeen,
  markAuthAwaitingContinue,
  clearAuthAwaitingContinue,
  isAuthAwaitingContinue,
  markAuthPendingEmailConfirm,
  clearAuthPendingEmailConfirm,
  getAuthPendingEmailConfirm,
} from "../lib/authFlow";

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
  const mobile = useMobileFrame();
  const supabaseReady = isSupabaseConfigured();
  const configIssue = getSupabaseConfigIssue();
  const configHelp = getSupabaseConfigHelp(configIssue);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUpMode, setIsSignUpMode] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [authComplete, setAuthComplete] = useState(false);
  const [awaitingEmailConfirm, setAwaitingEmailConfirm] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();

    async function bootstrapAuthState() {
      if (typeof window !== "undefined" && window.location.href.includes("access_token=")) {
        router.replace("/auth-confirmed");
        return;
      }

      const pendingEmail = await getAuthPendingEmailConfirm();
      if (pendingEmail) {
        setEmail((current) => current || pendingEmail);
        setAwaitingEmailConfirm(true);
        setIsSignUpMode(false);
      }

      const session = await getSession();
      const awaiting = await isAuthAwaitingContinue();
      if (session && awaiting) {
        setAuthComplete(true);
        setAwaitingEmailConfirm(false);
        setMessage("You're signed in. Continue when you're ready.");
      }
    }

    void bootstrapAuthState();

    if (!supabase) return undefined;

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        void (async () => {
          await markAuthAwaitingContinue();
          await clearAuthPendingEmailConfirm();
          setAwaitingEmailConfirm(false);
          setAuthComplete(true);
          setMessage("You're signed in. Continue when you're ready.");
        })();
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [router]);

  async function handleContinueToMylit() {
    setBusy(true);
    try {
      const mergeResult = await mergeCloudIntoLocalSafely();
      if (!mergeResult.ok) {
        setMessage("Signed in. Local progress kept — cloud sync will retry later.");
      }
      await clearAuthAwaitingContinue();
      const profile = await getOrCreateProfile();
      const onboardingDone = await isOnboardingComplete(profile);
      router.replace(onboardingDone ? "/(tabs)" : "/onboarding");
    } finally {
      setBusy(false);
    }
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
      await markAuthPendingEmailConfirm(trimmedEmail);
      setAwaitingEmailConfirm(true);
      setIsSignUpMode(false);
      setMessage(
        "We sent a confirmation link to your email. After you confirm, return to the MYLIT app on your Home Screen and sign in — then tap Continue to MYLIT."
      );
      return;
    }

    setMessage(mode === "signUp" ? "Account created. You're ready to continue." : "Welcome back. You're signed in.");
    if (mode === "signUp") {
      void trackEvent(ANALYTICS_EVENTS.signup_completed);
    }
    await markAuthAwaitingContinue();
    setAuthComplete(true);
  }

  async function handleContinueOffline() {
    await markWelcomeSeen();
    const onboardingDone = await isLocalOnboardingComplete();
    router.replace(onboardingDone ? "/(tabs)" : "/onboarding");
  }

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.phoneStageStyle, mobile.isFullscreen && styles.phoneStageFullscreen]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image
            source={uiAssets.backgrounds.neutral}
            style={styles.backgroundImage}
            resizeMode="cover"
          />
        </View>

        <FormScreen scrollPaddingBottom={mobile.formScrollPaddingBottom} contentContainerStyle={[formPageContent, styles.content]}>
          <Image source={uiAssets.logo.mylit} style={styles.logo} resizeMode="contain" />

          <View style={styles.heroPanel}>
            <Text style={styles.heroTitle}>MYLIT</Text>
            <Text style={styles.heroSubtitle}>
              {isSignUpMode ? "Start your beta journey" : "Welcome back, traveler"}
            </Text>
          </View>

          {!supabaseReady ? (
            <View style={styles.fallbackPanel}>
              <Text style={styles.fallbackTitle}>Supabase not ready</Text>
              <Text style={styles.fallbackText}>
                {configHelp ??
                  "Supabase env vars are not set, so account sign-in is unavailable in this build. You can still use MYLIT offline with your existing local progress."}
              </Text>
              {!configIssue ? (
                <TouchableOpacity style={styles.offlineButton} onPress={handleContinueOffline}>
                  <Text style={styles.offlineButtonText}>CONTINUE OFFLINE</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : authComplete ? (
            <View style={styles.successPanel}>
              <Text style={styles.successTitle}>You're in.</Text>
              <Text style={styles.successText}>
                Your account is connected. Continue to sync your MYLIT progress across devices.
              </Text>
              {message ? <Text style={styles.messageText}>{message}</Text> : null}
              <TouchableOpacity
                style={[styles.primaryButton, busy && styles.buttonDisabled]}
                onPress={handleContinueToMylit}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#FFF8E6" />
                ) : (
                  <Text style={styles.primaryButtonText}>CONTINUE TO MYLIT</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : awaitingEmailConfirm ? (
            <View style={styles.successPanel}>
              <Text style={styles.successTitle}>Check your email</Text>
              <Text style={styles.successText}>
                Confirm your email from the link we sent. When you're done, return to the MYLIT app on your Home
                Screen.
              </Text>
              {message ? <Text style={styles.messageText}>{message}</Text> : null}
              <Text style={styles.pendingHint}>
                After confirming, sign in below with the same email and password. MYLIT will show Continue to MYLIT.
              </Text>
              <View style={styles.formPanel}>
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
                <TouchableOpacity
                  style={[styles.primaryButton, busy && styles.buttonDisabled]}
                  onPress={() => handleAuth("signIn")}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator color="#FFF8E6" />
                  ) : (
                    <Text style={styles.primaryButtonText}>SIGN IN AFTER CONFIRM</Text>
                  )}
                </TouchableOpacity>
              </View>
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
        </FormScreen>
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
    paddingTop: 24,
    paddingBottom: 28,
    zIndex: 1,
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
    fontSize: 16,
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
  successPanel: {
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
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 8,
    textAlign: "center",
  },
  successText: {
    color: "#CBD5E1",
    fontFamily: readableFont,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    textAlign: "center",
    marginBottom: 12,
  },
  pendingHint: {
    color: "#86EFAC",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 15,
    textAlign: "center",
    marginBottom: 12,
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
