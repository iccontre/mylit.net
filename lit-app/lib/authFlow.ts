import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Href } from "expo-router";

import {
  getSession,
  isLocalOnboardingComplete,
  isOnboardingComplete,
  isSupabaseConfigured,
  prepareReturningUserAfterSync,
  WELCOME_SEEN_KEY,
} from "./auth";

export const FLOW_ROUTES = new Set(["welcome", "auth", "profile-setup", "onboarding"]);
export const AUTH_AWAITING_CONTINUE_KEY = "lit_auth_awaiting_continue";
export const PROFILE_AWAITING_CONTINUE_KEY = "lit_profile_awaiting_continue";
export const AUTH_PENDING_EMAIL_CONFIRM_KEY = "lit_auth_pending_email_confirm";

export async function markAuthAwaitingContinue(): Promise<void> {
  await AsyncStorage.setItem(AUTH_AWAITING_CONTINUE_KEY, "true");
}

export async function clearAuthAwaitingContinue(): Promise<void> {
  await AsyncStorage.removeItem(AUTH_AWAITING_CONTINUE_KEY);
}

export async function isAuthAwaitingContinue(): Promise<boolean> {
  return (await AsyncStorage.getItem(AUTH_AWAITING_CONTINUE_KEY)) === "true";
}

export async function markProfileAwaitingContinue(): Promise<void> {
  await AsyncStorage.setItem(PROFILE_AWAITING_CONTINUE_KEY, "true");
}

export async function clearProfileAwaitingContinue(): Promise<void> {
  await AsyncStorage.removeItem(PROFILE_AWAITING_CONTINUE_KEY);
}

export async function isProfileAwaitingContinue(): Promise<boolean> {
  return (await AsyncStorage.getItem(PROFILE_AWAITING_CONTINUE_KEY)) === "true";
}

export async function markAuthPendingEmailConfirm(email: string): Promise<void> {
  await AsyncStorage.setItem(AUTH_PENDING_EMAIL_CONFIRM_KEY, email.trim());
}

export async function clearAuthPendingEmailConfirm(): Promise<void> {
  await AsyncStorage.removeItem(AUTH_PENDING_EMAIL_CONFIRM_KEY);
}

export async function getAuthPendingEmailConfirm(): Promise<string | null> {
  const value = await AsyncStorage.getItem(AUTH_PENDING_EMAIL_CONFIRM_KEY);
  return value?.trim() || null;
}

export function isAuthFlowPath(pathname: string): boolean {
  const segment = pathname.replace(/^\//, "").split("/")[0] ?? "";
  if (segment === "auth-confirmed") return true;
  return FLOW_ROUTES.has(segment);
}

export function shouldEnforceFlow(pathname: string): boolean {
  return !isAuthFlowPath(pathname);
}

export async function hasSeenWelcome(): Promise<boolean> {
  const seen = await AsyncStorage.getItem(WELCOME_SEEN_KEY);
  return seen === "true";
}

export async function markWelcomeSeen(): Promise<void> {
  await AsyncStorage.setItem(WELCOME_SEEN_KEY, "true");
}

export async function resolvePostAuthRoute(): Promise<Href> {
  const profile = await prepareReturningUserAfterSync();
  const onboardingDone = await isOnboardingComplete(profile);
  if (onboardingDone) {
    await markWelcomeSeen();
  }
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

  if (await isAuthAwaitingContinue()) {
    return "/auth";
  }

  const profile = await prepareReturningUserAfterSync();
  const onboardingDone = await isOnboardingComplete(profile);
  if (onboardingDone) {
    await markWelcomeSeen();
    return "/(tabs)";
  }
  return "/onboarding";
}

export async function resolveRequiredRouteForPath(pathname: string): Promise<Href | null> {
  const segment = pathname.replace(/^\//, "").split("/")[0] ?? "";

  // First-time onboarding and "Set My Path" edits both use this screen.
  if (segment === "onboarding") return null;

  if (segment === "auth" && (await isAuthAwaitingContinue())) return null;
  if (segment === "auth-confirmed") return null;
  if (segment === "profile-setup") return "/onboarding";

  const required = await resolveInitialRoute();

  if (required === "/welcome" && segment !== "welcome") return "/welcome";
  if (required === "/auth" && segment !== "auth" && segment !== "welcome" && segment !== "auth-confirmed") {
    return "/auth";
  }
  if (required === "/onboarding" && shouldEnforceFlow(pathname)) return "/onboarding";
  if (
    required === "/(tabs)" &&
    (segment === "welcome" || segment === "auth" || segment === "profile-setup" || segment === "auth-confirmed")
  ) {
    return "/(tabs)";
  }

  return null;
}
