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
import { getOrCreateProfile, isProfileComplete, updateProfile } from "../lib/auth";
import {
  clearProfileAwaitingContinue,
  isProfileAwaitingContinue,
  markProfileAwaitingContinue,
} from "../lib/authFlow";

const AGE_RANGES = ["13-15", "16-17", "18-20", "21-24", "25+"] as const;

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

export default function ProfileSetupScreen() {
  const router = useRouter();
  const mobile = useMobileFrame();

  const [displayName, setDisplayName] = useState("");
  const [ageRange, setAgeRange] = useState<string>("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileSaved, setProfileSaved] = useState(false);

  useEffect(() => {
    async function loadExisting() {
      const profile = await getOrCreateProfile();
      if (profile?.display_name) setDisplayName(profile.display_name);
      if (profile?.age_range) setAgeRange(profile.age_range);
      if (profile?.beta_invite_code) setInviteCode(profile.beta_invite_code);
      const awaiting = await isProfileAwaitingContinue();
      if (awaiting && isProfileComplete(profile)) {
        setProfileSaved(true);
      }
      setLoading(false);
    }
    void loadExisting();
  }, []);

  async function handleContinueToMylit() {
    await clearProfileAwaitingContinue();
    router.replace("/onboarding");
  }

  async function handleSave() {
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setError("Add a display name so MYLIT knows what to call you.");
      return;
    }

    setBusy(true);
    setError("");
    const result = await updateProfile({
      display_name: trimmedName,
      age_range: ageRange || null,
      beta_invite_code: inviteCode.trim() || null,
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.error ?? "Could not save your profile.");
      return;
    }

    await markProfileAwaitingContinue();
    setProfileSaved(true);
    setError("");
  }

  if (loading) {
    return (
      <View style={[styles.pageRoot, mobile.pageRootStyle]}>
        <ActivityIndicator color="#9BE331" size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.pageRoot, mobile.pageRootStyle]}>
      <View style={[styles.phoneStage, mobile.stageShellStyle, mobile.touchMobile && styles.phoneStageFullscreen]}>
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Image
            source={uiAssets.backgrounds.progress}
            style={styles.backgroundImage}
            resizeMode="cover"
          />
        </View>

        <FormScreen scrollPaddingBottom={mobile.formScrollPaddingBottom} contentContainerStyle={[formPageContent, styles.content]}>
          <Image source={uiAssets.logo.mylit} style={styles.logo} resizeMode="contain" />

          <View style={styles.heroPanel}>
            <Text style={styles.heroTitle}>Save Your Profile</Text>
            <Text style={styles.heroSubtitle}>A quick setup before your path begins.</Text>
          </View>

          <View style={styles.formPanel}>
            {!profileSaved ? (
              <>
            <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Example: Isaac"
              placeholderTextColor="#8A5D2B"
            />

            <Text style={styles.fieldLabel}>AGE RANGE (OPTIONAL)</Text>
            <View style={styles.ageRow}>
              {AGE_RANGES.map((range) => {
                const selected = ageRange === range;
                return (
                  <TouchableOpacity
                    key={range}
                    style={[styles.ageChip, selected && styles.ageChipSelected]}
                    onPress={() => setAgeRange(selected ? "" : range)}
                  >
                    <Text style={[styles.ageChipText, selected && styles.ageChipTextSelected]}>
                      {range}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>BETA INVITE CODE (OPTIONAL)</Text>
            <TextInput
              style={styles.input}
              value={inviteCode}
              onChangeText={setInviteCode}
              autoCapitalize="characters"
              placeholder="Enter code if you have one"
              placeholderTextColor="#8A5D2B"
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.primaryButton, busy && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#FFF8E6" />
              ) : (
                <Text style={styles.primaryButtonText}>SAVE PROFILE</Text>
              )}
            </TouchableOpacity>
              </>
            ) : (
              <View style={styles.successPanel}>
                <Text style={styles.successTitle}>Profile saved.</Text>
                <Text style={styles.successText}>
                  Your beta profile is ready. Continue to set your path in onboarding.
                </Text>
                <TouchableOpacity style={styles.primaryButton} onPress={handleContinueToMylit}>
                  <Text style={styles.primaryButtonText}>CONTINUE TO MYLIT</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
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
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 1,
    textAlign: "center",
  },
  heroSubtitle: {
    color: "#F8FAFC",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 6,
    textAlign: "center",
  },
  formPanel: {
    backgroundColor: "rgba(46,32,20, 0.86)",
    borderWidth: 2,
    borderColor: "#D99A16",
    borderRadius: 8,
    padding: 14,
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
    backgroundColor: "rgba(255, 242, 201, 0.92)",
    borderWidth: 2,
    borderColor: "#6F4312",
    borderRadius: 8,
    color: "#1F1306",
    fontFamily: readableFont,
    fontSize: 16,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  ageRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  ageChip: {
    borderWidth: 2,
    borderColor: "#5C4425",
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "rgba(2, 6, 23, 0.75)",
  },
  ageChipSelected: {
    borderColor: "#22C55E",
    backgroundColor: "rgba(20, 83, 45, 0.75)",
  },
  ageChipText: {
    color: "#CBD5E1",
    fontFamily: pixelFont,
    fontSize: 10,
    fontWeight: "900",
  },
  ageChipTextSelected: {
    color: "#9BE331",
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
  errorText: {
    color: "#FCA5A5",
    fontFamily: pixelFont,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 8,
    lineHeight: 16,
  },
  successPanel: {
    alignItems: "center",
  },
  successTitle: {
    color: "#9BE331",
    fontFamily: pixelFont,
    fontSize: 18,
    fontWeight: "900",
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
    marginBottom: 14,
  },
});
