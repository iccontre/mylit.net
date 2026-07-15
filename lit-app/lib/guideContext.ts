import { getSession } from "./auth";
import { persistProgressKeys } from "./progressStore";
import { readJson } from "./readJson";
import { GUIDE_CONTEXT_RECORDS_KEY } from "./storageKeys";
import type { GuideContextRecord, GuideContextSourceType, GuideName } from "./agentTypes";

const MAX_SNAPSHOT_CHARS = 2000;

function generateId(): string {
  return `gcr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadGuideContextRecords(): Promise<GuideContextRecord[]> {
  const list = await readJson<GuideContextRecord[]>(GUIDE_CONTEXT_RECORDS_KEY, []);
  return Array.isArray(list) ? list : [];
}

/** Active (non-revoked) records for one guide, newest first — what an orchestration pass may read. */
export async function loadActiveGuideContext(guide: GuideName): Promise<GuideContextRecord[]> {
  const all = await loadGuideContextRecords();
  return all
    .filter((record) => record.guide === guide && !record.revokedAt)
    .sort((a, b) => new Date(b.permissionGrantedAt).getTime() - new Date(a.permissionGrantedAt).getTime());
}

/**
 * Creates one new consent grant. Called only AFTER the user has previewed sourceTextSnapshot
 * and explicitly confirmed (see components/FeedToGuideModal.tsx) — this function itself does
 * not show any UI or ask for confirmation, it just persists what was already agreed to.
 * Never awards steps — sharing context is not a completion.
 */
export async function shareEntryWithGuide(input: {
  guide: GuideName;
  sourceType: GuideContextSourceType;
  sourceId: string;
  sourceText: string;
}): Promise<GuideContextRecord> {
  const session = await getSession();
  const now = new Date().toISOString();
  const record: GuideContextRecord = {
    id: generateId(),
    userId: session?.user?.id ?? "local",
    guide: input.guide,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceTextSnapshot: input.sourceText.trim().slice(0, MAX_SNAPSHOT_CHARS),
    permissionGrantedAt: now,
    updatedAt: now,
    schemaVersion: 1,
  };

  const existing = await loadGuideContextRecords();
  await persistProgressKeys({ [GUIDE_CONTEXT_RECORDS_KEY]: JSON.stringify([...existing, record]) });
  return record;
}

/** Revoking never deletes the record (kept for audit) — it is simply excluded from every
 *  future orchestration pass by loadActiveGuideContext. See the revokedAt merge ratchet in
 *  progressStore.ts's mergeJsonArrays (a revoked record can never be un-revoked by a stale sync). */
export async function revokeGuideContext(id: string): Promise<GuideContextRecord[]> {
  const existing = await loadGuideContextRecords();
  const now = new Date().toISOString();
  const next = existing.map((record) => (record.id === id ? { ...record, revokedAt: now, updatedAt: now } : record));
  await persistProgressKeys({ [GUIDE_CONTEXT_RECORDS_KEY]: JSON.stringify(next) });
  return next;
}
