import { persistProgressKeys } from "./progressStore";
import { readJson } from "./readJson";
import { GUIDE_PLAN_FEEDBACK_KEY } from "./storageKeys";
import type { GuidePlanFeedback } from "./agentTypes";

// Learning-over-time metadata for generated quest proposals — deliberately small and
// structured (no raw prompts), feeding future generation quality. Array-merged by proposalId
// like every other log (see ARRAY_MERGE_PROGRESS_KEYS), so a retry never duplicates an entry —
// it just updates the SAME record (completed/fulfillmentRating get filled in later by the
// existing completion/fulfillment ledger, never a second row).

const HISTORY_CAP = 300;

async function loadAll(): Promise<GuidePlanFeedback[]> {
  return readJson<GuidePlanFeedback[]>(GUIDE_PLAN_FEEDBACK_KEY, []);
}

export async function recordGuidePlanFeedback(
  input: Pick<GuidePlanFeedback, "proposalId" | "source" | "accepted" | "edited" | "originalDuration"> & Partial<Pick<GuidePlanFeedback, "acceptedDuration">>
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await loadAll();
  const next: GuidePlanFeedback = {
    proposalId: input.proposalId,
    source: input.source,
    accepted: input.accepted,
    edited: input.edited,
    originalDuration: input.originalDuration,
    acceptedDuration: input.acceptedDuration,
    createdAt: now,
    updatedAt: now,
  };
  const filtered = existing.filter((entry) => entry.proposalId !== input.proposalId);
  await persistProgressKeys({ [GUIDE_PLAN_FEEDBACK_KEY]: JSON.stringify([next, ...filtered].slice(0, HISTORY_CAP)) });
}

/** Called once a quest sourced from a GuidePlanFeedback-tracked proposal is completed, so
 *  future generation can learn which durations/modes actually get finished. Safe to call even
 *  if no matching feedback record exists (a manually-created quest, or one from before this
 *  system existed) — it's then simply a no-op. */
export async function markGuidePlanFeedbackCompleted(proposalId: string, fulfillmentRating?: number): Promise<void> {
  const existing = await loadAll();
  const match = existing.find((entry) => entry.proposalId === proposalId);
  if (!match) return;
  const now = new Date().toISOString();
  const next = existing.map((entry) =>
    entry.proposalId === proposalId
      ? { ...entry, completed: true, fulfillmentRating: fulfillmentRating ?? entry.fulfillmentRating, updatedAt: now }
      : entry
  );
  await persistProgressKeys({ [GUIDE_PLAN_FEEDBACK_KEY]: JSON.stringify(next) });
}
