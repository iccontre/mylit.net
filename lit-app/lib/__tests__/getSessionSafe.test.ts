jest.mock("../supabase", () => ({
  getSupabaseClient: jest.fn(),
}));

import { getSupabaseClient } from "../supabase";
import { getSession, getSessionSafe } from "../auth";

const mockGetSupabaseClient = getSupabaseClient as jest.Mock;

describe("getSessionSafe never throws, unlike getSession", () => {
  afterEach(() => {
    mockGetSupabaseClient.mockReset();
  });

  it("returns null without throwing when Supabase isn't configured", async () => {
    mockGetSupabaseClient.mockReturnValue(null);
    await expect(getSessionSafe()).resolves.toBeNull();
  });

  it("propagates a real session when the lookup succeeds", async () => {
    const fakeSession = { user: { id: "u1" } };
    mockGetSupabaseClient.mockReturnValue({
      auth: { getSession: jest.fn().mockResolvedValue({ data: { session: fakeSession } }) },
    });
    await expect(getSessionSafe()).resolves.toBe(fakeSession);
  });

  it("getSession rejects when the underlying client throws (e.g. network failure)", async () => {
    mockGetSupabaseClient.mockReturnValue({
      auth: { getSession: jest.fn().mockRejectedValue(new Error("network down")) },
    });
    await expect(getSession()).rejects.toThrow("network down");
  });

  it("getSessionSafe swallows the same failure and resolves to null instead of rejecting", async () => {
    mockGetSupabaseClient.mockReturnValue({
      auth: { getSession: jest.fn().mockRejectedValue(new Error("network down")) },
    });
    await expect(getSessionSafe()).resolves.toBeNull();
  });
});
