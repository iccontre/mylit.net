import { getSession } from "./auth";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";

export type StepRank = {
  /** 1-based rank among all players by total steps. Most steps = 1. Ties share the same rank. */
  rank: number;
  /** How many players currently have a synced step total (includes the caller). */
  totalPlayers: number;
};

/**
 * Upserts the caller's total steps into the shared leaderboard table and
 * returns their rank among all players in one round trip. Returns null when
 * ranking can't be computed — no Supabase config, no signed-in session, or a
 * network/RPC error — callers should treat that as "not ranked yet" rather
 * than an error state.
 */
export async function syncAndGetStepRank(totalSteps: number): Promise<StepRank | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const session = await getSession();
    if (!session) return null;

    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data, error } = await supabase.rpc("sync_and_rank_my_steps", {
      p_total_steps: Math.max(0, Math.round(totalSteps)),
    });

    if (error) {
      console.warn("syncAndGetStepRank failed:", error.message);
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.rank !== "number") return null;

    return {
      rank: row.rank,
      totalPlayers: typeof row.total_players === "number" ? row.total_players : 1,
    };
  } catch (error) {
    console.warn("syncAndGetStepRank error:", error);
    return null;
  }
}
