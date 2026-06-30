import { getSupabaseClient } from "./supabase";

export function getAuthEmailConfirmRedirectUrl(): string | undefined {
  if (typeof window === "undefined" || !window.location?.origin) return undefined;
  return `${window.location.origin}/auth-confirmed`;
}

function hasAuthCallbackInUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes("access_token=") ||
    lower.includes("refresh_token=") ||
    lower.includes("type=signup") ||
    lower.includes("type=email") ||
    lower.includes("type=recovery") ||
    url.includes("code=")
  );
}

export async function consumeAuthCallbackFromUrl(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const href = window.location.href;
  if (!hasAuthCallbackInUrl(href)) return false;

  const supabase = getSupabaseClient();
  if (!supabase) return false;

  try {
    const current = new URL(href);
    const code = current.searchParams.get("code");

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.warn("exchangeCodeForSession failed:", error.message);
      }
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn("getSession after auth callback failed:", error.message);
    }

    window.history.replaceState({}, "", "/auth-confirmed");
    return Boolean(data.session);
  } catch (error) {
    console.warn("consumeAuthCallbackFromUrl failed:", error);
    return false;
  }
}
