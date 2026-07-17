import AsyncStorage from "@react-native-async-storage/async-storage";

import { loadActiveGuideContext, loadGuideContextRecords, revokeGuideContext, shareEntryWithGuide } from "../guideContext";
import { mergeJsonArrays } from "../progressStore";
import { shouldRunEvieHandoff } from "../guideOrchestration";
import { loadLearningMemory, resetLearnedGuidePreferences } from "../mylitAgents";
import type { GuideContextRecord } from "../agentTypes";

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("Feed to Guide consent grants", () => {
  it("creates a record with an exact snapshot of the shared text", async () => {
    const record = await shareEntryWithGuide({
      guide: "luna",
      sourceType: "journal",
      sourceId: "journal-1",
      sourceText: "  Feeling tired today.  ",
    });
    expect(record.sourceTextSnapshot).toBe("Feeling tired today.");
    expect(record.revokedAt).toBeUndefined();
    expect(record.guide).toBe("luna");
  });

  it("newly shared records are immediately visible to loadActiveGuideContext for that guide only", async () => {
    await shareEntryWithGuide({ guide: "luna", sourceType: "journal", sourceId: "j1", sourceText: "for luna" });
    await shareEntryWithGuide({ guide: "evie", sourceType: "pathGoal", sourceId: "p1", sourceText: "for evie" });

    const luna = await loadActiveGuideContext("luna");
    const evie = await loadActiveGuideContext("evie");
    expect(luna).toHaveLength(1);
    expect(luna[0].sourceTextSnapshot).toBe("for luna");
    expect(evie).toHaveLength(1);
    expect(evie[0].sourceTextSnapshot).toBe("for evie");
  });

  it("sharing never awards steps or touches any progress key besides the guide context ledger", async () => {
    await shareEntryWithGuide({ guide: "luna", sourceType: "reflection", sourceId: "r1", sourceText: "text" });
    expect(await AsyncStorage.getItem("lit_total_steps_floor")).toBeNull();
    expect(await AsyncStorage.getItem("lit_daily_steps_log")).toBeNull();
  });
});

describe("permission scopes", () => {
  it("defaults to luna_support for Luna and evie_planning for Evie when no scope is passed", async () => {
    const luna = await shareEntryWithGuide({ guide: "luna", sourceType: "journal", sourceId: "j1", sourceText: "text" });
    const evie = await shareEntryWithGuide({ guide: "evie", sourceType: "pathGoal", sourceId: "p1", sourceText: "text" });
    expect(luna.permissionScope).toEqual(["luna_support"]);
    expect(evie.permissionScope).toEqual(["evie_planning"]);
  });

  it("honors an explicit permissionScope including luna_to_evie_summary", async () => {
    const record = await shareEntryWithGuide({
      guide: "luna",
      sourceType: "reflection",
      sourceId: "r1",
      sourceText: "text",
      permissionScope: ["luna_support", "luna_to_evie_summary"],
    });
    expect(record.permissionScope).toEqual(["luna_support", "luna_to_evie_summary"]);
  });

  it("loadActiveGuideContext with requiredScope only returns records granted that scope", async () => {
    await shareEntryWithGuide({ guide: "luna", sourceType: "journal", sourceId: "j2", sourceText: "no summary scope" });
    await shareEntryWithGuide({
      guide: "luna",
      sourceType: "reflection",
      sourceId: "r2",
      sourceText: "has summary scope",
      permissionScope: ["luna_support", "luna_to_evie_summary"],
    });

    const anyLuna = await loadActiveGuideContext("luna");
    const summaryScoped = await loadActiveGuideContext("luna", "luna_to_evie_summary");
    expect(anyLuna).toHaveLength(2);
    expect(summaryScoped).toHaveLength(1);
    expect(summaryScoped[0].sourceTextSnapshot).toBe("has summary scope");
  });

  it("a record with no permissionScope field at all (pre-migration) is never treated as luna_to_evie_summary", async () => {
    const legacyRecord: GuideContextRecord = {
      id: "gcr_legacy",
      userId: "u1",
      guide: "luna",
      sourceType: "journal",
      sourceId: "j3",
      sourceTextSnapshot: "legacy entry",
      permissionGrantedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      schemaVersion: 1,
    };
    await AsyncStorage.setItem("lit_guide_context_records", JSON.stringify([legacyRecord]));
    const summaryScoped = await loadActiveGuideContext("luna", "luna_to_evie_summary");
    expect(summaryScoped).toHaveLength(0);
  });
});

describe("resetLearnedGuidePreferences (Guide Ledger's Reset Learned Preferences action)", () => {
  it("clears the derived learning memory back to its empty default", async () => {
    await AsyncStorage.setItem("lit_learning_memory", JSON.stringify({ lastUpdatedAt: new Date().toISOString(), preferredQuestDurations: [30] }));
    await resetLearnedGuidePreferences();
    const memory = await loadLearningMemory();
    expect(memory.preferredQuestDurations).toBeUndefined();
  });

  it("never touches explicitly shared Guide Context entries", async () => {
    await shareEntryWithGuide({ guide: "luna", sourceType: "journal", sourceId: "j1", sourceText: "keep me" });
    await resetLearnedGuidePreferences();
    const active = await loadActiveGuideContext("luna");
    expect(active).toHaveLength(1);
    expect(active[0].sourceTextSnapshot).toBe("keep me");
  });
});

describe("revoking access", () => {
  it("a revoked record is excluded from loadActiveGuideContext", async () => {
    const record = await shareEntryWithGuide({ guide: "luna", sourceType: "dream", sourceId: "d1", sourceText: "dream text" });
    await revokeGuideContext(record.id);
    const active = await loadActiveGuideContext("luna");
    expect(active).toHaveLength(0);
  });

  it("revoking keeps the record for audit (not deleted) with revokedAt set", async () => {
    const record = await shareEntryWithGuide({ guide: "evie", sourceType: "pathGoal", sourceId: "p2", sourceText: "goal text" });
    await revokeGuideContext(record.id);
    const all = await loadGuideContextRecords();
    expect(all).toHaveLength(1);
    expect(all[0].revokedAt).toBeTruthy();
  });

  it("revoking an id that doesn't exist is a safe no-op", async () => {
    await shareEntryWithGuide({ guide: "luna", sourceType: "journal", sourceId: "j2", sourceText: "text" });
    const next = await revokeGuideContext("nonexistent-id");
    expect(next).toHaveLength(1);
    expect(next[0].revokedAt).toBeUndefined();
  });
});

describe("revocation survives cross-device merge (one-way ratchet, mirrors deletedAt)", () => {
  it("a device that hasn't seen the revocation yet can never resurrect it via merge", () => {
    const grantedAt = new Date("2026-01-01T00:00:00Z").toISOString();
    const revokedAt = new Date("2026-01-02T00:00:00Z").toISOString();
    const base: GuideContextRecord = {
      id: "gcr_1",
      userId: "u1",
      guide: "luna",
      sourceType: "journal",
      sourceId: "j1",
      sourceTextSnapshot: "text",
      permissionGrantedAt: grantedAt,
      updatedAt: grantedAt,
      schemaVersion: 1,
    };
    // Device A revoked it; Device B is stale and still has the non-revoked copy, possibly with
    // a LATER-looking updatedAt due to clock skew — the revokedAt ratchet must win regardless.
    const deviceA = JSON.stringify([{ ...base, revokedAt, updatedAt: revokedAt }]);
    const deviceB = JSON.stringify([{ ...base, updatedAt: new Date("2026-01-03T00:00:00Z").toISOString() }]);

    const merged = JSON.parse(mergeJsonArrays(deviceB, deviceA)) as GuideContextRecord[];
    expect(merged).toHaveLength(1);
    expect(merged[0].revokedAt).toBe(revokedAt);
  });
});

describe("bounded Luna->Evie handoff gating (shouldRunEvieHandoff)", () => {
  const okLuna = {
    ok: true as const,
    record: {
      id: "s1",
      createdAt: new Date().toISOString(),
      userMessage: "hi",
      response: {
        status: "ready" as const,
        guide: "luna" as const,
        supportMessage: "",
        whatLunaNoticed: [],
        suggestedPlanAdjustments: [],
        recoveryQuestSuggestions: [],
        evieHandoffNote: "user seems overloaded, ease up on Progress quests",
        safetyNote: "",
      },
    },
  };

  it("does not run Evie when Luna's call failed", () => {
    expect(shouldRunEvieHandoff({ ok: false, error: "network" }, [{} as GuideContextRecord])).toBe(false);
  });

  it("does not run Evie when Luna produced no handoff note", () => {
    const noHandoff = { ...okLuna, record: { ...okLuna.record, response: { ...okLuna.record.response, evieHandoffNote: "" } } };
    expect(shouldRunEvieHandoff(noHandoff, [{} as GuideContextRecord])).toBe(false);
  });

  it("does not run Evie without the user separately permitting Evie context, even if Luna has a handoff note and the summary scope is granted", () => {
    expect(shouldRunEvieHandoff(okLuna, [], [{} as GuideContextRecord])).toBe(false);
  });

  it("does not run Evie when Evie context is permitted but the user never opted any Luna entry into luna_to_evie_summary", () => {
    expect(shouldRunEvieHandoff(okLuna, [{} as GuideContextRecord], [])).toBe(false);
    expect(shouldRunEvieHandoff(okLuna, [{} as GuideContextRecord])).toBe(false);
  });

  it("runs Evie only when Luna succeeded with a handoff note AND Evie context is permitted AND luna_to_evie_summary was separately opted in", () => {
    expect(shouldRunEvieHandoff(okLuna, [{} as GuideContextRecord], [{} as GuideContextRecord])).toBe(true);
  });
});
