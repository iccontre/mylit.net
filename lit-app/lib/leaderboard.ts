import { getSession } from "./auth";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";

export type LeaderboardEntry = {
  userId: string;
  displayName: string;
  totalSteps: number;
  rank: 1 | 2 | 3;
  isCurrentUser: boolean;
  updatedAt: string;
};

export type LeaderboardSettings = {
  visible: boolean;
  displayName: string;
};

/**
 * Top 3 opted-in players by authoritative lifetime steps, via the server-side
 * get_leaderboard_top3() RPC (see supabase/migrations/20260718000000_leaderboard.sql) — never
 * downloads or queries other users' raw rows from the client. Returns null (never throws) when
 * Supabase isn't configured, there's no session, or the RPC fails — callers should treat that
 * as "leaderboard unavailable right now" rather than an error state, matching syncAndGetStepRank.
 */
export async function getLeaderboardTop3(): Promise<LeaderboardEntry[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const session = await getSession();
    if (!session) return null;
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data, error } = await supabase.rpc("get_leaderboard_top3");
    if (error) {
      console.warn("getLeaderboardTop3 failed:", error.message);
      return null;
    }
    if (!Array.isArray(data)) return null;

    return data
      .filter((row) => row && typeof row.rank === "number" && row.rank >= 1 && row.rank <= 3)
      .map((row) => ({
        userId: String(row.user_id),
        displayName: typeof row.display_name === "string" && row.display_name.trim() ? row.display_name : "Explorer",
        totalSteps: Math.max(0, Math.round(Number(row.total_steps) || 0)),
        rank: row.rank as 1 | 2 | 3,
        isCurrentUser: Boolean(row.is_current_user),
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date(0).toISOString(),
      }));
  } catch (error) {
    console.warn("getLeaderboardTop3 error:", error);
    return null;
  }
}

/** The caller's own current leaderboard privacy settings — RLS already restricts this table to
 *  "select own row only", so this reads directly rather than needing another RPC. */
export async function loadMyLeaderboardSettings(): Promise<LeaderboardSettings | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const session = await getSession();
    if (!session) return null;
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("user_step_totals")
      .select("leaderboard_visible, leaderboard_display_name")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (error) {
      console.warn("loadMyLeaderboardSettings failed:", error.message);
      return null;
    }
    // No row yet (never synced a step total) — defaults match the DB column defaults
    // (leaderboard_visible defaults true: "anonymized participation" until the row exists).
    return {
      visible: data ? Boolean(data.leaderboard_visible) : true,
      displayName: data?.leaderboard_display_name ?? "",
    };
  } catch (error) {
    console.warn("loadMyLeaderboardSettings error:", error);
    return null;
  }
}

/**
 * Updates only the caller's own leaderboard visibility/display name via update_my_leaderboard_settings
 * — never touches total_steps, so changing this can never affect anyone's step total or rank
 * beyond who's visible. Returns false (never throws) on failure.
 */
export async function updateMyLeaderboardSettings(settings: LeaderboardSettings): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    const { error } = await supabase.rpc("update_my_leaderboard_settings", {
      p_visible: settings.visible,
      p_display_name: settings.displayName.trim().slice(0, 40) || null,
    });
    if (error) {
      console.warn("updateMyLeaderboardSettings failed:", error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("updateMyLeaderboardSettings error:", error);
    return false;
  }
}
