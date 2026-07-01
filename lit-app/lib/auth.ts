import AsyncStorage from "@react-native-async-storage/async-storage";

import { getAuthEmailConfirmRedirectUrl } from "./authEmailConfirm";
import { getSupabaseClient, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";

export const WELCOME_SEEN_KEY = "lit_welcome_seen";
export const BETA_PROFILE_KEY = "lit_beta_profile";
export const LOCAL_PROFILE_KEY = "lit_user_profile";

export type BetaProfile = {
  id?: string;
  display_name: string | null;
  age_range: string | null;
  beta_invite_code: string | null;
  onboarding_complete: boolean;
  path_focus?: string | null;
};

export type LocalBetaProfile = {
  display_name?: string;
  age_range?: string;
  beta_invite_code?: string;
};

export type AuthResult = {
  ok: boolean;
  error?: string;
};

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

async function signInAfterSignUp(
  supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
  email: string,
  password: string
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error && data.session) return { ok: true };
  return { ok: false, error: error ? mapSupabaseAuthError(error.message) : undefined };
}

function shouldRetrySignInAfterSignUpFailure(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("over_email_send") ||
    lower.includes("already registered") ||
    lower.includes("already been registered") ||
    lower.includes("email_exists") ||
    lower.includes("user already registered")
  );
}

export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured for this build." };
  }

  const cleanedEmail = clean(email);
  const emailRedirectTo = getAuthEmailConfirmRedirectUrl();

  const { data, error } = await supabase.auth.signUp({
    email: cleanedEmail,
    password,
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });

  if (error) {
    if (shouldRetrySignInAfterSignUpFailure(error.message)) {
      const recovered = await signInAfterSignUp(supabase, cleanedEmail, password);
      if (recovered.ok) return recovered;
    }
    return { ok: false, error: mapSupabaseAuthError(error.message) };
  }

  if (data.session) return { ok: true };

  // When email confirmation is off, Supabase may still omit the session on signUp.
  const recovered = await signInAfterSignUp(supabase, cleanedEmail, password);
  if (recovered.ok) return recovered;

  return { ok: true };
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured for this build." };
  }

  const { error } = await supabase.auth.signInWithPassword({ email: clean(email), password });
  if (error) return { ok: false, error: mapSupabaseAuthError(error.message) };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getSession() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function isProfileComplete(profile: BetaProfile | null): boolean {
  return Boolean(clean(profile?.display_name));
}

export async function loadLocalBetaProfile(): Promise<LocalBetaProfile | null> {
  const raw = await AsyncStorage.getItem(BETA_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocalBetaProfile;
  } catch {
    return null;
  }
}

export async function saveLocalBetaProfile(profile: LocalBetaProfile): Promise<void> {
  await AsyncStorage.setItem(BETA_PROFILE_KEY, JSON.stringify(profile));
}

type LocalPathProfile = {
  onboardingComplete?: boolean;
  name?: string;
  dreamCategory?: string;
  specificGoal?: string;
  shortTermGoal?: string;
  midTermGoal?: string;
  longTermGoal?: string;
  goalsGeneratedAt?: string;
};

const PROGRESS_MARKERS = [
  "lit_completed_quests",
  "lit_user_stats",
  "lit_day_plan",
  "lit_journal_entries",
  "lit_checkin_history",
  "lit_latest_checkin",
  "lit_dream_journal",
  "lit_reflections",
  "lit_tomorrow_queue",
] as const;

async function readLocalPathProfile(): Promise<LocalPathProfile | null> {
  const raw = await AsyncStorage.getItem(LOCAL_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocalPathProfile;
  } catch {
    return null;
  }
}

export async function hasCompletedPathProfile(): Promise<boolean> {
  const profile = await readLocalPathProfile();
  if (!profile) return false;
  if (profile.onboardingComplete) return true;
  if (!profile.dreamCategory?.trim()) return false;
  if (profile.goalsGeneratedAt) return true;
  if (profile.shortTermGoal?.trim() || profile.midTermGoal?.trim() || profile.longTermGoal?.trim()) {
    return true;
  }
  if (profile.specificGoal?.trim() && profile.name?.trim()) return true;
  return false;
}

async function hasMeaningfulSavedProgress(): Promise<boolean> {
  for (const key of PROGRESS_MARKERS) {
    const raw = await AsyncStorage.getItem(key);
    if (!raw?.trim()) continue;
    const trimmed = raw.trim();
    if (trimmed === "{}" || trimmed === "[]" || trimmed === "null") continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed) && parsed.length === 0) continue;
      if (parsed && typeof parsed === "object" && Object.keys(parsed as object).length === 0) continue;
      return true;
    } catch {
      return true;
    }
  }
  return false;
}

export async function ensureLocalOnboardingFlag(): Promise<void> {
  const raw = await AsyncStorage.getItem(LOCAL_PROFILE_KEY);
  let localProfile: Record<string, unknown> = {};
  if (raw) {
    try {
      localProfile = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      localProfile = {};
    }
  }
  if (localProfile.onboardingComplete) return;
  localProfile.onboardingComplete = true;
  await AsyncStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(localProfile));
}

export async function isLocalOnboardingComplete(): Promise<boolean> {
  if (await hasCompletedPathProfile()) return true;
  const profile = await readLocalPathProfile();
  return Boolean(profile?.onboardingComplete);
}

export async function getOrCreateProfile(): Promise<BetaProfile | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const local = await loadLocalBetaProfile();
    if (!local?.display_name) return null;
    return {
      display_name: local.display_name ?? null,
      age_range: local.age_range ?? null,
      beta_invite_code: local.beta_invite_code ?? null,
      onboarding_complete: await isLocalOnboardingComplete(),
    };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return null;

  const { data: existing, error: fetchError } = await supabase
    .from("profiles")
    .select("id, display_name, age_range, beta_invite_code, onboarding_complete, path_focus")
    .eq("id", userId)
    .maybeSingle();

  if (fetchError) {
    console.warn("getOrCreateProfile fetch failed:", fetchError.message);
  }

  if (existing) {
    return existing as BetaProfile;
  }

  const localBeta = await loadLocalBetaProfile();

  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .insert({
      id: userId,
      display_name: localBeta?.display_name ?? null,
      age_range: localBeta?.age_range ?? null,
      beta_invite_code: localBeta?.beta_invite_code ?? null,
      onboarding_complete: false,
    })
    .select("id, display_name, age_range, beta_invite_code, onboarding_complete, path_focus")
    .single();

  if (insertError) {
    console.warn("getOrCreateProfile insert failed:", insertError.message);
    return null;
  }

  return created as BetaProfile;
}

export type ProfileUpdateInput = {
  display_name?: string | null;
  age_range?: string | null;
  beta_invite_code?: string | null;
  onboarding_complete?: boolean;
};

export async function updateProfile(updates: ProfileUpdateInput): Promise<AuthResult> {
  const localPatch: LocalBetaProfile = {};
  if (updates.display_name !== undefined) localPatch.display_name = clean(updates.display_name);
  if (updates.age_range !== undefined) localPatch.age_range = clean(updates.age_range);
  if (updates.beta_invite_code !== undefined) localPatch.beta_invite_code = clean(updates.beta_invite_code);

  if (Object.keys(localPatch).length > 0) {
    const existing = (await loadLocalBetaProfile()) ?? {};
    await saveLocalBetaProfile({ ...existing, ...localPatch });
  }

  const supabase = getSupabaseClient();
  if (!supabase) return { ok: true };

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return { ok: false, error: "No active session." };

  const payload: Record<string, string | boolean | null> = {};
  if (updates.display_name !== undefined) payload.display_name = clean(updates.display_name) || null;
  if (updates.age_range !== undefined) payload.age_range = clean(updates.age_range) || null;
  if (updates.beta_invite_code !== undefined) payload.beta_invite_code = clean(updates.beta_invite_code) || null;
  if (updates.onboarding_complete !== undefined) payload.onboarding_complete = updates.onboarding_complete;

  const { error } = await supabase.from("profiles").update(payload).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function isOnboardingComplete(profile?: BetaProfile | null): Promise<boolean> {
  const localDone = await isLocalOnboardingComplete();
  if (isSupabaseConfigured()) {
    const cloudDone = Boolean(profile?.onboarding_complete);
    const hasProgress = await hasMeaningfulSavedProgress();
    const pathComplete = await hasCompletedPathProfile();
    const returningAccount =
      Boolean(clean(profile?.display_name)) && (hasProgress || pathComplete || cloudDone);
    return localDone || cloudDone || returningAccount;
  }
  return localDone;
}

/** After cloud merge, mirror profile.onboarding_complete into local storage when wiped (e.g. PWA reinstall). */
export async function syncLocalOnboardingFromCloudProfile(profile: BetaProfile | null): Promise<void> {
  const pathComplete = await hasCompletedPathProfile();
  if (!profile?.onboarding_complete && !pathComplete) return;

  const raw = await AsyncStorage.getItem(LOCAL_PROFILE_KEY);
  let localProfile: Record<string, unknown> = {};
  if (raw) {
    try {
      localProfile = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      localProfile = {};
    }
  }

  if (localProfile.onboardingComplete) return;

  localProfile.onboardingComplete = true;
  if (!localProfile.name && profile?.display_name) {
    localProfile.name = profile.display_name;
  }
  await AsyncStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(localProfile));
}

export async function prepareReturningUserAfterSync(): Promise<BetaProfile | null> {
  let profile = await getOrCreateProfile();
  await syncLocalOnboardingFromCloudProfile(profile);

  const pathComplete = await hasCompletedPathProfile();
  const hasProgress = await hasMeaningfulSavedProgress();
  const shouldMarkComplete =
    pathComplete || hasProgress || Boolean(profile?.onboarding_complete);

  if (shouldMarkComplete) {
    await ensureLocalOnboardingFlag();
    if (profile && !profile.onboarding_complete) {
      const repaired = await updateProfile({ onboarding_complete: true });
      if (repaired.ok) {
        profile = { ...profile, onboarding_complete: true };
      }
    }
  }

  return profile;
}

export { isSupabaseConfigured };
