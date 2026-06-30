import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

export type SupabaseConfigIssue =
  | "missing_url"
  | "missing_key"
  | "invalid_url"
  | "invalid_key_format"
  | "service_role_key"
  | null;

function looksLikeJwt(value: string): boolean {
  const segments = value.split(".");
  return segments.length === 3 && segments.every((part) => part.length > 0) && value.length > 20;
}

function jwtRole(value: string): string | null {
  try {
    const payloadSegment = value.split(".")[1];
    if (!payloadSegment) return null;
    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(normalized)) as { role?: string };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

export function getSupabaseConfigIssue(): SupabaseConfigIssue {
  if (!supabaseUrl) return "missing_url";
  if (!supabaseAnonKey) return "missing_key";
  if (!supabaseUrl.startsWith("https://")) return "invalid_url";
  if (!looksLikeJwt(supabaseAnonKey)) return "invalid_key_format";

  const role = jwtRole(supabaseAnonKey);
  if (role === "service_role") return "service_role_key";

  return null;
}

export function getSupabaseConfigHelp(issue: SupabaseConfigIssue): string | null {
  switch (issue) {
    case "missing_url":
      return "Missing EXPO_PUBLIC_SUPABASE_URL. Add it in Vercel and redeploy.";
    case "missing_key":
      return "Missing EXPO_PUBLIC_SUPABASE_ANON_KEY. Add the anon/public key in Vercel and redeploy.";
    case "invalid_url":
      return "EXPO_PUBLIC_SUPABASE_URL must start with https://";
    case "invalid_key_format":
      return "EXPO_PUBLIC_SUPABASE_ANON_KEY looks malformed. Use the Supabase anon/public key in Vercel, then redeploy.";
    case "service_role_key":
      return "Do not use the service_role key in the app. Set EXPO_PUBLIC_SUPABASE_ANON_KEY to the anon/public key in Vercel, then redeploy.";
    default:
      return null;
  }
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfigIssue() === null;
}

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: typeof window !== "undefined",
      },
    });
  }
  return client;
}

export function mapSupabaseAuthError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("invalid api key")) {
    const issue = getSupabaseConfigIssue();
    if (issue === "service_role_key") {
      return "Do not use the service_role key in the app. Set EXPO_PUBLIC_SUPABASE_ANON_KEY to the anon/public key in Vercel, then redeploy.";
    }
    if (issue && issue !== null) {
      const help = getSupabaseConfigHelp(issue);
      if (help) return help;
    }
    return "Supabase is configured incorrectly. Check EXPO_PUBLIC_SUPABASE_ANON_KEY in Vercel and redeploy production.";
  }

  if (lower.includes("invalid login credentials")) {
    return "Email or password did not match. Try again or sign up first.";
  }

  return message;
}
