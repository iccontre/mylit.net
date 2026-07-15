import { loadActiveGuideContext } from "./guideContext";
import { requestLunaSupport, type RequestLunaSupportResult } from "./lunaSupportModifier";
import { requestEviePathPipeline, type RequestEviePathPipelineResult } from "./evieAiPathPipeline";
import type { GuideContextRecord } from "./agentTypes";

export type GuideOrchestrationResult = {
  luna: RequestLunaSupportResult;
  /** null when Evie never ran — see shouldRunEvieHandoff for exactly why. */
  evie: RequestEviePathPipelineResult | null;
};

function formatContextForPrompt(records: GuideContextRecord[]): string {
  return records.map((record) => `- (${record.sourceType}) ${record.sourceTextSnapshot}`).join("\n");
}

/**
 * Evie only ever runs as a SECOND step of this SAME bounded pass, and only when Luna actually
 * produced something worth handing off AND the user has separately permitted Evie to see at
 * least one piece of Path context. No permitted Evie context means no Evie call — Luna having
 * permission never implies Evie does too (each guide's access is independently consented).
 */
export function shouldRunEvieHandoff(luna: RequestLunaSupportResult, evieContext: GuideContextRecord[]): boolean {
  if (!luna.ok) return false;
  if (!luna.record.response.evieHandoffNote?.trim()) return false;
  return evieContext.length > 0;
}

/**
 * ONE bounded orchestration pass — never an autonomous/looping conversation. Call this
 * explicitly (e.g. a "Check in with your guides" action, or after relevant data changes like a
 * new consent grant) rather than on a timer or automatically on every screen visit.
 *
 * Step 1 — Luna converts whatever context the user has permitted her to see (plus MYLIT's own
 * existing signals: misses, energy, sleep, reflections — see requestLunaSupport) into a
 * structured support response, including an evieHandoffNote.
 * Step 2 — Evie receives ONLY that handoff note plus whatever Path context the user has
 * separately permitted HER to see, and proposes quest changes. Nothing is applied here — every
 * existing save/apply helper (saveAiDailyQuestSuggestion, applyReduceDuration, etc.) already
 * requires an explicit user tap to take effect, so review-before-apply is inherited for free.
 */
export async function runBoundedGuideOrchestration(userTrigger: string): Promise<GuideOrchestrationResult> {
  const lunaContext = await loadActiveGuideContext("luna");
  const lunaPrompt = lunaContext.length > 0
    ? `${userTrigger}\n\nContext I've explicitly shared with you:\n${formatContextForPrompt(lunaContext)}`
    : userTrigger;
  const luna = await requestLunaSupport(lunaPrompt);

  const evieContext = await loadActiveGuideContext("evie");
  if (!shouldRunEvieHandoff(luna, evieContext)) {
    return { luna, evie: null };
  }

  const handoffNote = luna.ok ? luna.record.response.evieHandoffNote : "";
  const eviePrompt = `${handoffNote}\n\nContext I've explicitly shared with you:\n${formatContextForPrompt(evieContext)}`;
  const evie = await requestEviePathPipeline(eviePrompt);
  return { luna, evie };
}
