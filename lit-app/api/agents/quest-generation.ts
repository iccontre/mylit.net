import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

import { buildFallbackQuestGeneration } from "../../lib/questGenerationFallback";
import { classifyAiError, logAiUsage } from "../../lib/aiUsageLog";
import { getEnergyDelta } from "../../lib/scheduling";
import type { GeneratedQuestProposal, QuestGenerationContext, QuestGenerationResult } from "../../lib/agentTypes";

const ROUTE_NAME = "quest-generation";

// Server-only route: the ONE shared quest-generation contract used by Morning Check-In,
// Afternoon Check-In, and onboarding weekly-plan generation (see spec section 2/lib/agentTypes.ts's
// QuestGenerationContext). Same discipline as api/agents/evie-path-pipeline.ts:
//
// - Reads OPENAI_API_KEY from environment variables ONLY.
// - Any missing key / model failure ALWAYS responds 200 with the deterministic fallback
//   (lib/questGenerationFallback.ts) — never a hard client failure just because AI is down.
// - Produces DRAFT proposals only. Nothing here saves a quest — that only happens when the
//   user explicitly accepts on the client, through the existing canonical quest/save helpers.
// - The request body carries only compact, already-authorized context (see
//   QuestGenerationContext) — never raw journal/reflection text. Luna's own structured
//   accommodation summary may be included, never the private entries behind it.
// - Structural/economic fields (proposalId, energyCost, sourceLabel, targetDateKey,
//   variantGroup) are always computed/forced SERVER-SIDE from durationMinutes+mode via the
//   same getEnergyDelta economy the rest of the app uses — the model only supplies the
//   creative fields (title/description/rationale/durationMinutes/mode/variantLabel).

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const REQUEST_TIMEOUT_MS = 45000;
const DURATION_LADDER = [15, 30, 45, 60] as const;

const SLOT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "rationale", "durationMinutes", "mode", "variantLabel", "suggestedStartAt"],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    rationale: { type: "string" },
    durationMinutes: { type: "number", enum: [15, 30, 45, 60] },
    mode: { type: "string", enum: ["progress", "recovery"] },
    variantLabel: { type: "string", enum: ["push_forward", "focused_pace", "progress", "recovery"] },
    /** Empty string when no specific time is suggested. */
    suggestedStartAt: { type: "string" },
  },
} as const;

const RESPONSE_JSON_SCHEMA = {
  name: "quest_generation",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["proposals"],
    properties: {
      proposals: { type: "array", items: SLOT_SCHEMA },
    },
  },
} as const;

const SYSTEM_PROMPT = `You are the shared quest-generation brain behind MYLIT's Evie (progress/success guide) and
Luna (recovery/support guide), for teens and college students. You propose DRAFT quest slots —
the user must explicitly accept before anything becomes a real quest.

The request's "source" field decides what to produce:

- "morning_checkin": the user answered "What do you want to get done today?" (see intention).
  Produce EXACTLY 2 slots pursuing the SAME goal, never two unrelated tasks:
  - variantLabel "push_forward": higher effort, longer/more demanding, higher energy cost,
    stronger progress toward the stated goal — but still realistic within the user's schedule.
  - variantLabel "focused_pace": lower energy cost, shorter/more focused, preserves the most
    important part of the same goal, appropriate for a lower-capacity day.
  push_forward's durationMinutes must be strictly greater than focused_pace's.

- "afternoon_checkin": propose 0-2 slots using remaining energy, current mode, the original
  intention, completed/incomplete quests (activeQuestTitles — never propose a duplicate of
  these), remaining availableMinutes, and Calendar/food/recovery context:
  - at most one variantLabel "progress" slot: the single most useful realistic remaining action.
  - at most one variantLabel "recovery" slot: only when recovery would genuinely improve the
    rest of the day — do not force one if it doesn't fit.
  If availableMinutes is small, produce a smaller action, never an unrealistic one. It is fine
  to return zero or one slot when nothing else productively fits.

- "onboarding_week": targetWeekDates lists the week's dates. For EACH date, produce exactly one
  variantLabel "progress" slot and one variantLabel "recovery" slot (so proposals.length ==
  2 * targetWeekDates.length), in date order (all of date[0]'s slots, then date[1]'s, ...).
  Progress slots must connect to milestones.twoWeek/oneMonth/threeMonth (favor shorter/easier
  quests early in the week when little is known yet about the user). Never propose duplicate
  or semantically identical quests across the week. Recovery is a normal, valued part of the
  week — never frame it as failure or a lesser task.

Hard rules for every slot:
- durationMinutes must be one of 15, 30, 45, or 60.
- Respect wakeTime/sleepTime — never suggest anything during the sleep window; suggestedStartAt
  (if set) must fall within waking hours, expressed like "8:30 AM" or left as an empty string.
- Respect availableMinutes when present — never propose something that can't realistically fit.
- Do not diagnose, label, or make medical/therapeutic claims. Emotional context may shape tone,
  duration, quest count, recovery balance, and timing — never used to silently remove a goal.
- Do not shame the user for low energy or a recovery-heavy day.
- Use only the context provided — lifeProfile/learningMemory/patternContext/milestones are
  already the ONLY information you have consented access to; do not invent unknown facts about
  the user.
- Keep title/description/rationale short, concrete, and in the user's own words where possible
  (morning_checkin's intention text especially) — never generic filler.`;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function clampDuration(minutes: unknown): 15 | 30 | 45 | 60 {
  const num = typeof minutes === "number" && Number.isFinite(minutes) ? minutes : 30;
  let best: 15 | 30 | 45 | 60 = 15;
  for (const step of DURATION_LADDER) {
    if (num >= step) best = step;
  }
  return best;
}

type RawSlot = {
  title?: unknown;
  description?: unknown;
  rationale?: unknown;
  durationMinutes?: unknown;
  mode?: unknown;
  variantLabel?: unknown;
  suggestedStartAt?: unknown;
};

function sourceLabelFor(source: QuestGenerationContext["source"], variantLabel: GeneratedQuestProposal["variantLabel"]): string {
  if (variantLabel === "recovery") return "Recovery suggested by Luna";
  if (source === "onboarding_week") return "Suggested by Evie from your Path";
  if (source === "afternoon_checkin") return "Suggested by Evie from today's progress";
  return "Suggested by Evie from today's intention";
}

/** Forces every structural/economic field server-side — the model only ever supplies the
 *  creative text. This is the same "AI proposes, app validates" boundary evie-path-pipeline
 *  and lunaSupportModifier already use. */
function buildProposalsFromModel(request: QuestGenerationContext, rawProposals: RawSlot[]): GeneratedQuestProposal[] {
  const slots = rawProposals
    .filter((slot) => isNonEmptyString(slot.title))
    .map((slot) => ({
      title: (slot.title as string).trim(),
      description: isNonEmptyString(slot.description) ? (slot.description as string).trim() : "",
      rationale: isNonEmptyString(slot.rationale) ? (slot.rationale as string).trim() : "",
      durationMinutes: clampDuration(slot.durationMinutes),
      mode: slot.mode === "recovery" ? ("recovery" as const) : ("progress" as const),
      variantLabel: (["push_forward", "focused_pace", "progress", "recovery"] as const).includes(slot.variantLabel as never)
        ? (slot.variantLabel as GeneratedQuestProposal["variantLabel"])
        : slot.mode === "recovery" ? "recovery" : "progress",
      suggestedStartAt: isNonEmptyString(slot.suggestedStartAt) ? (slot.suggestedStartAt as string).trim() : undefined,
    }));

  if (request.source === "morning_checkin") {
    const push = slots.find((s) => s.variantLabel === "push_forward") ?? slots[0];
    const focused = slots.find((s) => s.variantLabel === "focused_pace") ?? slots[1];
    const pair = [push, focused].filter((s): s is NonNullable<typeof s> => Boolean(s));
    // Enforce push > focused duration even if the model got it backwards.
    if (pair.length === 2 && pair[0].durationMinutes <= pair[1].durationMinutes) {
      const idx = DURATION_LADDER.indexOf(pair[1].durationMinutes);
      pair[0].durationMinutes = DURATION_LADDER[Math.min(DURATION_LADDER.length - 1, idx + 1)];
    }
    const variantGroup = `morning-${request.logicalDayKey}`;
    return pair.map((slot, i) => ({
      proposalId: `${request.requestId}-${slot.variantLabel}`,
      title: slot.title,
      description: slot.description || "A version of today's goal.",
      mode: slot.mode,
      durationMinutes: slot.durationMinutes,
      energyCost: getEnergyDelta({ kind: slot.mode, durationMinutes: slot.durationMinutes }),
      suggestedStartAt: slot.suggestedStartAt,
      rationale: slot.rationale || "Matches today's stated intention.",
      sourceLabel: sourceLabelFor(request.source, slot.variantLabel),
      variantGroup,
      variantLabel: (i === 0 ? "push_forward" : "focused_pace") as GeneratedQuestProposal["variantLabel"],
    }));
  }

  if (request.source === "afternoon_checkin") {
    const activeLower = new Set((request.activeQuestTitles ?? []).map((t) => t.trim().toLowerCase()));
    const variantGroup = `afternoon-${request.logicalDayKey}`;
    const progress = slots.find((s) => s.variantLabel === "progress" && !activeLower.has(s.title.toLowerCase()));
    const recovery = slots.find((s) => s.variantLabel === "recovery" && !activeLower.has(s.title.toLowerCase()));
    return [progress, recovery]
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .map((slot) => ({
        proposalId: `${request.requestId}-${slot.variantLabel}`,
        title: slot.title,
        description: slot.description || "One realistic step for the rest of today.",
        mode: slot.mode,
        durationMinutes: slot.durationMinutes,
        energyCost: getEnergyDelta({ kind: slot.mode, durationMinutes: slot.durationMinutes }),
        suggestedStartAt: slot.suggestedStartAt,
        rationale: slot.rationale || "Fits your remaining time and energy today.",
        sourceLabel: sourceLabelFor(request.source, slot.variantLabel),
        variantGroup,
        variantLabel: slot.variantLabel,
      }));
  }

  // onboarding_week
  const dates = request.targetWeekDates ?? [];
  const progressSlots = slots.filter((s) => s.mode === "progress");
  const recoverySlots = slots.filter((s) => s.mode === "recovery");
  const proposals: GeneratedQuestProposal[] = [];
  dates.forEach((dateKey, i) => {
    const variantGroup = `week-${dateKey}`;
    const progress = progressSlots[i];
    const recovery = recoverySlots[i];
    if (progress) {
      proposals.push({
        proposalId: `${request.requestId}-${dateKey}-progress`,
        title: progress.title,
        description: progress.description || "One concrete step this day.",
        mode: "progress",
        durationMinutes: progress.durationMinutes,
        energyCost: getEnergyDelta({ kind: "progress", durationMinutes: progress.durationMinutes }),
        suggestedStartAt: progress.suggestedStartAt,
        rationale: progress.rationale || "Connects to your Path milestones.",
        sourceLabel: sourceLabelFor(request.source, "progress"),
        targetDateKey: dateKey,
        variantGroup,
        variantLabel: "progress",
      });
    }
    if (recovery) {
      proposals.push({
        proposalId: `${request.requestId}-${dateKey}-recovery`,
        title: recovery.title,
        description: recovery.description || "A short recovery step this day.",
        mode: "recovery",
        durationMinutes: recovery.durationMinutes,
        energyCost: getEnergyDelta({ kind: "recovery", durationMinutes: recovery.durationMinutes }),
        suggestedStartAt: recovery.suggestedStartAt,
        rationale: recovery.rationale || "Keeps the week sustainable.",
        sourceLabel: sourceLabelFor(request.source, "recovery"),
        targetDateKey: dateKey,
        variantGroup,
        variantLabel: "recovery",
      });
    }
  });
  return proposals;
}

function buildUserContent(input: QuestGenerationContext): string {
  const compact = {
    source: input.source,
    logicalDayKey: input.logicalDayKey,
    intention: (input.intention ?? "").slice(0, 2000),
    currentEnergy: input.currentEnergy,
    currentMode: input.currentMode,
    availableMinutes: input.availableMinutes,
    wakeTime: input.wakeTime,
    sleepTime: input.sleepTime,
    activeQuestTitles: (input.activeQuestTitles ?? []).slice(0, 30),
    targetWeekDates: (input.targetWeekDates ?? []).slice(0, 7),
    milestones: input.milestones ?? {},
    lunaAccommodationSummary: (input.lunaAccommodationSummary ?? "").slice(0, 1000),
    acceptedPathContextText: (input.acceptedPathContextText ?? []).slice(0, 10).map((t) => t.slice(0, 500)),
    acceptedLunaContextText: (input.acceptedLunaContextText ?? []).slice(0, 10).map((t) => t.slice(0, 500)),
    lifeProfile: input.lifeProfile,
    learningMemory: input.learningMemory,
    patternContext: input.patternContext ?? {},
  };
  return JSON.stringify(compact);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let body: Partial<QuestGenerationContext>;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  if (!body || typeof body !== "object" || !isNonEmptyString(body.requestId) || !isNonEmptyString(body.logicalDayKey)) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const source: QuestGenerationContext["source"] =
    body.source === "afternoon_checkin" || body.source === "onboarding_week" ? body.source : "morning_checkin";

  const request: QuestGenerationContext = {
    requestId: body.requestId,
    logicalDayKey: body.logicalDayKey,
    source,
    intention: body.intention,
    currentEnergy: body.currentEnergy,
    currentMode: body.currentMode,
    availableMinutes: body.availableMinutes,
    wakeTime: body.wakeTime,
    sleepTime: body.sleepTime,
    acceptedPathContextIds: Array.isArray(body.acceptedPathContextIds) ? body.acceptedPathContextIds : [],
    acceptedLunaContextIds: Array.isArray(body.acceptedLunaContextIds) ? body.acceptedLunaContextIds : [],
    calendarSnapshotHash: body.calendarSnapshotHash ?? "",
    lifeProfile: body.lifeProfile ?? {},
    learningMemory: body.learningMemory ?? { lastUpdatedAt: new Date(0).toISOString() },
    patternContext: body.patternContext,
    activeQuestTitles: body.activeQuestTitles,
    targetWeekDates: body.targetWeekDates,
    milestones: body.milestones,
    lunaAccommodationSummary: body.lunaAccommodationSummary,
    acceptedPathContextText: body.acceptedPathContextText,
    acceptedLunaContextText: body.acceptedLunaContextText,
  };

  const userContent = buildUserContent(request);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    logAiUsage({ route: ROUTE_NAME, promptChars: userContent.length, ok: false, reason: "missing_key" });
    res.status(200).json(buildFallbackQuestGeneration(request, "missing_key"));
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create(
      {
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_schema", json_schema: RESPONSE_JSON_SCHEMA },
        temperature: 0.6,
      },
      { signal: controller.signal }
    );

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty model response");

    logAiUsage({ route: ROUTE_NAME, promptChars: userContent.length, completionChars: raw.length, ok: true });

    const parsed = JSON.parse(raw) as { proposals: RawSlot[] };
    const proposals = buildProposalsFromModel(request, Array.isArray(parsed.proposals) ? parsed.proposals : []);

    const result: QuestGenerationResult = {
      requestId: request.requestId,
      proposals,
      generatedAt: new Date().toISOString(),
      contextVersion: "1",
    };
    res.status(200).json(result);
  } catch (error) {
    const reason = classifyAiError(error);
    console.warn("quest-generation model call failed:", error instanceof Error ? error.message : error);
    logAiUsage({ route: ROUTE_NAME, promptChars: userContent.length, ok: false, reason });
    res.status(200).json(buildFallbackQuestGeneration(request, reason));
  } finally {
    clearTimeout(timeout);
  }
}
