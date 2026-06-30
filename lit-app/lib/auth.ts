import AsyncStorage from "@react-native-async-storage/async-storage";

import { getSupabaseClient, isSupabaseConfigured } from "./supabase";

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

export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured for this build." };
  }

  const { error } = await supabase.auth.signUp({ email: clean(email), password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured for this build." };
  }

  const { error } = await supabase.auth.signInWithPassword({ email: clean(email), password });
  if (error) return { ok: false, error: error.message };
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

export async function isLocalOnboardingComplete(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(LOCAL_PROFILE_KEY);
  if (!raw) return false;
  try {
    const profile = JSON.parse(raw) as { onboardingComplete?: boolean };
    return Boolean(profile.onboardingComplete);
  } catch {
    return false;
  }
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

  const localOnboardingComplete = await isLocalOnboardingComplete();
  const localBeta = await loadLocalBetaProfile();

  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .insert({
      id: userId,
      display_name: localBeta?.display_name ?? null,
      age_range: localBeta?.age_range ?? null,
      beta_invite_code: localBeta?.beta_invite_code ?? null,
      onboarding_complete: localOnboardingComplete,
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
  if (profile?.onboarding_complete) return true;
  return isLocalOnboardingComplete();
}

export { isSupabaseConfigured };
