import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

import { buildCrisisSafeLunaResponse, buildSafeFallbackLunaSupport } from "../../lib/lunaAiFallback";
import { matchesCrisisLanguage } from "../../lib/crisisDetection";
import { classifyAiError, logAiUsage } from "../../lib/aiUsageLog";
import type { LunaSupportModifierRequest, LunaSupportModifierResponse } from "../../lib/agentTypes";

const ROUTE_NAME = "luna-support-modifier";

// Server-only route: Luna's first LLM-backed support/plan-adjustment guide.
//
// - Reads OPENAI_API_KEY from environment variables ONLY — never EXPO_PUBLIC_OPENAI_API_KEY.
// - Luna is NOT a general chatbot here: she notices struggle (missed quests, low energy,
//   poor sleep, heavy reflections) and proposes gentle, reviewable plan adjustments. She
//   never applies a change herself — the client only applies one after the user taps Accept,
//   through the same validated mutation helpers as everything else (lib/lunaSupportModifier.ts).
// - Crisis/self-harm language is checked BEFORE anything else, deterministically, and bypasses
//   the model entirely — the model is never trusted alone for this. On a match, no productivity
//   suggestions are generated, ever.
// - Missing key or any model failure always falls back to a deterministic response (HTTP 200,
//   never a crash).
// - Only compact structured context is sent to the model — never raw journal/reflection text.

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const MAX_MESSAGE_LENGTH = 4000;

const RESPONSE_JSON_SCHEMA = {
  name: "luna_support_modifier",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "status",
      "guide",
      "supportMessage",
      "whatLunaNoticed",
      "suggestedPlanAdjustments",
      "recoveryQuestSuggestions",
      "evieHandoffNote",
      "safetyNote",
    ],
    properties: {
      status: { type: "string", enum: ["ready", "support_only", "needs_clarification"] },
      guide: { type: "string", enum: ["luna"] },
      supportMessage: { type: "string" },
      whatLunaNoticed: { type: "array", items: { type: "string" } },
      suggestedPlanAdjustments: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["type", "reason", "targetQuestId", "suggestedDurationMinutes"],
          properties: {
            type: {
              type: "string",
              enum: [
                "reduce_duration",
                "move_later",
                "move_earlier",
                "swap_progress_for_recovery",
                "add_recovery",
                "pause_goal",
                "ask_evie_to_rebuild",
              ],
            },
            reason: { type: "string" },
            targetQuestId: { type: ["string", "null"] },
            suggestedDurationMinutes: { type: ["number", "null"] },
          },
        },
      },
      recoveryQuestSuggestions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "reason", "durationMinutes", "energyRestoreEstimate"],
          properties: {
            title: { type: "string" },
            reason: { type: "string" },
            durationMinutes: { type: "number", enum: [15, 30, 45, 60] },
            energyRestoreEstimate: { type: "number" },
          },
        },
      },
      evieHandoffNote: { type: "string" },
      safetyNote: { type: "string" },
    },
  },
} as const;

const SYSTEM_PROMPT = `You are Luna, MYLIT's support and recovery guide for teens and college students.

In this phase, Luna is NOT a general chatbot. Your only job is to notice when the user is
struggling (missed quests, overwhelm, low energy, poor sleep, heavy reflections) and propose
gentle, reviewable adjustments to their current plan. You never apply a change yourself — the
app will ask the user to approve each suggestion individually.

Rules you must follow:
- Be supportive, gentle, and recovery-focused. Recovery is valid progress, not a lesser choice.
- Never shame the user for missed quests, low energy, or struggling in general.
- Recognize struggle signals: missed quests, overwhelm, low energy, poor/interrupted sleep, and
  heavy or difficult reflections. Reference what you actually noticed in whatLunaNoticed.
- suggestedPlanAdjustments must only reference targetQuestId values that exist in the provided
  activeQuests list (or be null/omitted for adjustments that don't target one specific quest,
  like ask_evie_to_rebuild or pause_goal).
- Do not invent quest ids. Do not suggest suggestedDurationMinutes above 60.
- Do not claim medical, psychiatric, or therapeutic diagnosis/treatment — MYLIT is
  wellness/productivity support only, not a substitute for professional care.
- If status is "needs_clarification", ask what's going on a little more clearly in
  supportMessage rather than guessing — but still be warm, not clinical.
- Every suggestion is optional for the user — do not create pressure to accept anything.
- Respect MYLIT's mechanics: quests are "progress" or "recovery" mode; only Today's Quest can
  ever run 2 hours (never suggest that here); never suggest scheduling past midnight.
- patternContext.recentModeTrend ("recovery_heavy" | "progress_heavy" | "balanced") is the
  user's actual recent trend — if recovery_heavy, lean further into easier/shorter
  suggestions and a gentler supportMessage; you can suggest Evie rebuild the plan around a
  lighter baseline.
- patternContext.weekdayIntensity tells you which weekdays the user's own Weekly Habit reads
  as rest-oriented — treat those as good reasons to lean into recovery, not something to push
  through.
- sleepContext.caffeineTime and sleepContext.sleepGuideAdherence, when present, are for you to
  gently reference (e.g. late caffeine, inconsistent sleep) — never a medical claim, just
  supportive pattern-noticing.`;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function buildUserContent(input: LunaSupportModifierRequest): string {
  // Compact, structured context only — never raw journal/reflection text. reflectionSummary
  // is already a short, truncated excerpt by the time it reaches this route (see
  // lib/lunaSupportModifier.ts), never a full journal entry.
  const compact = {
    userMessage: input.userMessage.slice(0, MAX_MESSAGE_LENGTH),
    currentPathPipeline: input.currentPathPipeline,
    recentMisses: input.recentMisses.slice(0, 10),
    recentEnergy: input.recentEnergy,
    sleepContext: input.sleepContext,
    reflectionSummary: input.reflectionSummary,
    learningMemory: input.learningMemory,
    currentMode: input.currentMode,
    activeQuests: input.activeQuests.slice(0, 20),
    patternContext: input.patternContext ?? {},
  };
  return JSON.stringify(compact);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let body: Partial<LunaSupportModifierRequest>;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const userMessage = isNonEmptyString(body.userMessage) ? body.userMessage.slice(0, MAX_MESSAGE_LENGTH) : "";

  // Crisis check runs first, deterministically, before anything else — including before the
  // OPENAI_API_KEY check. It must never depend on AI being configured or working.
  if (userMessage && matchesCrisisLanguage(userMessage)) {
    res.status(200).json(buildCrisisSafeLunaResponse());
    return;
  }

  const request: LunaSupportModifierRequest = {
    userMessage,
    currentPathPipeline: body.currentPathPipeline ?? null,
    recentMisses: Array.isArray(body.recentMisses) ? body.recentMisses : [],
    recentEnergy: typeof body.recentEnergy === "number" ? body.recentEnergy : 50,
    sleepContext: body.sleepContext ?? {},
    reflectionSummary: body.reflectionSummary ?? null,
    learningMemory: body.learningMemory ?? { lastUpdatedAt: new Date(0).toISOString() },
    currentMode: body.currentMode === "progress" || body.currentMode === "recovery" ? body.currentMode : "neutral",
    activeQuests: Array.isArray(body.activeQuests) ? body.activeQuests : [],
    patternContext: body.patternContext,
  };

  const userContent = buildUserContent(request);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logAiUsage({ route: ROUTE_NAME, promptChars: userContent.length, ok: false, reason: "missing_key" });
    res.status(200).json(buildSafeFallbackLunaSupport(request, "missing_key"));
    return;
  }

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_schema", json_schema: RESPONSE_JSON_SCHEMA },
      temperature: 0.5,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty model response");

    logAiUsage({ route: ROUTE_NAME, promptChars: userContent.length, completionChars: raw.length, ok: true });

    const parsed = JSON.parse(raw) as LunaSupportModifierResponse;
    parsed.guide = "luna";

    // Defense in depth: strip any adjustment that references a quest id we didn't actually
    // send, or that exceeds the 2-hour-only-for-Today's-Quest / duration rules.
    const validIds = new Set(request.activeQuests.map((quest) => quest.id));
    parsed.suggestedPlanAdjustments = (parsed.suggestedPlanAdjustments ?? []).filter((adjustment) => {
      if (adjustment.targetQuestId && !validIds.has(adjustment.targetQuestId)) return false;
      if (typeof adjustment.suggestedDurationMinutes === "number" && adjustment.suggestedDurationMinutes > 60) return false;
      return true;
    });
    parsed.recoveryQuestSuggestions = (parsed.recoveryQuestSuggestions ?? []).filter(
      (quest) => [15, 30, 45, 60].includes(quest.durationMinutes)
    );

    res.status(200).json(parsed);
  } catch (error) {
    const reason = classifyAiError(error);
    console.warn("luna-support-modifier model call failed:", error instanceof Error ? error.message : error);
    logAiUsage({ route: ROUTE_NAME, promptChars: userContent.length, ok: false, reason });
    res.status(200).json(buildSafeFallbackLunaSupport(request, reason));
  }
}
