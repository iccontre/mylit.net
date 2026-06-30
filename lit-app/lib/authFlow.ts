import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Href } from "expo-router";

import {
  getOrCreateProfile,
  getSession,
  isLocalOnboardingComplete,
  isOnboardingComplete,
  isProfileComplete,
  isSupabaseConfigured,
  WELCOME_SEEN_KEY,
} from "./auth";

export const FLOW_ROUTES = new Set(["welcome", "auth", "profile-setup", "onboarding"]);

export function shouldEnforceFlow(pathname: string): boolean {
  const segment = pathname.replace(/^\//, "").split("/")[0] ?? "";
  return !FLOW_ROUTES.has(segment);
}

export async function hasSeenWelcome(): Promise<boolean> {
  const seen = await AsyncStorage.getItem(WELCOME_SEEN_KEY);
  return seen === "true";
}

export async function markWelcomeSeen(): Promise<void> {
  await AsyncStorage.setItem(WELCOME_SEEN_KEY, "true");
}

export async function resolvePostAuthRoute(): Promise<Href> {
  const profile = await getOrCreateProfile();
  if (!isProfileComplete(profile)) return "/profile-setup";

  const onboardingDone = await isOnboardingComplete(profile);
  return onboardingDone ? "/(tabs)" : "/onboarding";
}

export async function resolveInitialRoute(): Promise<Href> {
  const welcomeSeen = await hasSeenWelcome();

  if (!isSupabaseConfigured()) {
    if (!welcomeSeen) return "/welcome";
    const onboardingDone = await isLocalOnboardingComplete();
    return onboardingDone ? "/(tabs)" : "/onboarding";
  }

  const session = await getSession();
  if (!session) {
    if (!welcomeSeen) return "/welcome";
    return "/auth";
  }

  const profile = await getOrCreateProfile();
  if (!isProfileComplete(profile)) return "/profile-setup";

  const onboardingDone = await isOnboardingComplete(profile);
  return onboardingDone ? "/(tabs)" : "/onboarding";
}

export async function resolveRequiredRouteForPath(pathname: string): Promise<Href | null> {
  const segment = pathname.replace(/^\//, "").split("/")[0] ?? "";

  // First-time onboarding and "Set My Path" edits both use this screen.
  if (segment === "onboarding") return null;

  const required = await resolveInitialRoute();

  if (required === "/welcome" && segment !== "welcome") return "/welcome";
  if (required === "/auth" && segment !== "auth" && segment !== "welcome") return "/auth";
  if (required === "/profile-setup" && segment !== "profile-setup") return "/profile-setup";
  if (required === "/onboarding" && shouldEnforceFlow(pathname)) return "/onboarding";
  if (required === "/(tabs)" && (segment === "welcome" || segment === "auth" || segment === "profile-setup")) {
    return "/(tabs)";
  }

  return null;
}
