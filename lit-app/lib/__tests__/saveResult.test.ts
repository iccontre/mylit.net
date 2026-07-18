import { adaptBooleanSave, adaptRecordSave, adaptVoidSave } from "../saveResult";

describe("adaptVoidSave", () => {
  it("resolves ok with the given record when the write resolves", async () => {
    const result = await adaptVoidSave({ id: "1" }, async () => {});
    expect(result).toEqual({ ok: true, record: { id: "1" } });
  });

  it("resolves not-ok when the write throws, instead of propagating the throw", async () => {
    const result = await adaptVoidSave({ id: "1" }, async () => {
      throw new Error("disk full");
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("disk full");
  });
});

describe("adaptBooleanSave", () => {
  it("resolves ok when the write resolves true", async () => {
    const result = await adaptBooleanSave({ id: "1" }, async () => true);
    expect(result).toEqual({ ok: true, record: { id: "1" } });
  });

  it("resolves not-ok when the write resolves false (no throw)", async () => {
    const result = await adaptBooleanSave({ id: "1" }, async () => false);
    expect(result.ok).toBe(false);
  });

  it("resolves not-ok when the write throws", async () => {
    const result = await adaptBooleanSave({ id: "1" }, async () => {
      throw new Error("nope");
    });
    expect(result.ok).toBe(false);
  });
});

describe("adaptRecordSave", () => {
  it("resolves ok with the returned record when non-null", async () => {
    const result = await adaptRecordSave(async () => ({ id: "1" }));
    expect(result).toEqual({ ok: true, record: { id: "1" } });
  });

  it("resolves not-ok when the write resolves null (e.g. empty-entry no-op)", async () => {
    const result = await adaptRecordSave(async () => null);
    expect(result.ok).toBe(false);
  });

  it("resolves not-ok when the write throws", async () => {
    const result = await adaptRecordSave(async () => {
      throw new Error("nope");
    });
    expect(result.ok).toBe(false);
  });
});
