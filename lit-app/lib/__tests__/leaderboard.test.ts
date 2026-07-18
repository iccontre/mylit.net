jest.mock("../supabase", () => ({
  getSupabaseClient: jest.fn(),
  isSupabaseConfigured: jest.fn(),
}));
jest.mock("../auth", () => ({
  getSession: jest.fn(),
}));

import { getSupabaseClient, isSupabaseConfigured } from "../supabase";
import { getSession } from "../auth";
import { getLeaderboardTop3, updateMyLeaderboardSettings } from "../leaderboard";

const mockGetSupabaseClient = getSupabaseClient as jest.Mock;
const mockIsSupabaseConfigured = isSupabaseConfigured as jest.Mock;
const mockGetSession = getSession as jest.Mock;

describe("getLeaderboardTop3", () => {
  afterEach(() => jest.resetAllMocks());

  it("returns null when Supabase isn't configured — never throws", async () => {
    mockIsSupabaseConfigured.mockReturnValue(false);
    await expect(getLeaderboardTop3()).resolves.toBeNull();
  });

  it("returns null when there's no session — leaderboard is never fetched for a signed-out user", async () => {
    mockIsSupabaseConfigured.mockReturnValue(true);
    mockGetSession.mockResolvedValue(null);
    await expect(getLeaderboardTop3()).resolves.toBeNull();
  });

  it("maps server rows into typed entries, sorted rank 1-3, marking the current user", async () => {
    mockIsSupabaseConfigured.mockReturnValue(true);
    mockGetSession.mockResolvedValue({ user: { id: "me" } });
    const rpc = jest.fn().mockResolvedValue({
      data: [
        { user_id: "a", display_name: "Explorer 1234", total_steps: 500, rank: 2, is_current_user: false, updated_at: "2026-07-10T00:00:00.000Z" },
        { user_id: "me", display_name: "Custom Name", total_steps: 900, rank: 1, is_current_user: true, updated_at: "2026-07-09T00:00:00.000Z" },
        { user_id: "b", display_name: "Explorer 9876", total_steps: 100, rank: 3, is_current_user: false, updated_at: "2026-07-11T00:00:00.000Z" },
      ],
      error: null,
    });
    mockGetSupabaseClient.mockReturnValue({ rpc });

    const result = await getLeaderboardTop3();
    expect(rpc).toHaveBeenCalledWith("get_leaderboard_top3");
    expect(result).toHaveLength(3);
    expect(result!.find((e) => e.rank === 1)!.isCurrentUser).toBe(true);
    expect(result!.find((e) => e.rank === 1)!.displayName).toBe("Custom Name");
    expect(result!.find((e) => e.rank === 2)!.totalSteps).toBe(500);
  });

  it("returns null (not a throw) when the RPC errors", async () => {
    mockIsSupabaseConfigured.mockReturnValue(true);
    mockGetSession.mockResolvedValue({ user: { id: "me" } });
    mockGetSupabaseClient.mockReturnValue({ rpc: jest.fn().mockResolvedValue({ data: null, error: { message: "boom" } }) });
    await expect(getLeaderboardTop3()).resolves.toBeNull();
  });

  it("drops any row outside the 1-3 rank range as a defensive filter", async () => {
    mockIsSupabaseConfigured.mockReturnValue(true);
    mockGetSession.mockResolvedValue({ user: { id: "me" } });
    const rpc = jest.fn().mockResolvedValue({
      data: [{ user_id: "a", display_name: "X", total_steps: 5, rank: 7, is_current_user: false, updated_at: "2026-07-10T00:00:00.000Z" }],
      error: null,
    });
    mockGetSupabaseClient.mockReturnValue({ rpc });
    const result = await getLeaderboardTop3();
    expect(result).toHaveLength(0);
  });
});

describe("updateMyLeaderboardSettings never touches total_steps", () => {
  afterEach(() => jest.resetAllMocks());

  it("calls the dedicated settings RPC with only visibility/name params", async () => {
    mockIsSupabaseConfigured.mockReturnValue(true);
    const rpc = jest.fn().mockResolvedValue({ error: null });
    mockGetSupabaseClient.mockReturnValue({ rpc });

    const ok = await updateMyLeaderboardSettings({ visible: false, displayName: "Nightshade" });
    expect(ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("update_my_leaderboard_settings", { p_visible: false, p_display_name: "Nightshade" });
    // No call ever references total_steps or sync_and_rank_my_steps.
    expect(rpc.mock.calls[0][0]).not.toBe("sync_and_rank_my_steps");
  });

  it("returns false (not a throw) when the RPC fails", async () => {
    mockIsSupabaseConfigured.mockReturnValue(true);
    mockGetSupabaseClient.mockReturnValue({ rpc: jest.fn().mockResolvedValue({ error: { message: "boom" } }) });
    await expect(updateMyLeaderboardSettings({ visible: true, displayName: "" })).resolves.toBe(false);
  });
});
