import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

import { buildSafeFallbackEviePipeline } from "../../lib/evieAiFallback";
import type { EvieAiPathPipelineRequest, EvieAiPathPipelineResponse } from "../../lib/agentTypes";

// Server-only route: Evie's first LLM-backed path planner.
//
// - Reads OPENAI_API_KEY from environment variables ONLY. Never reference
//   EXPO_PUBLIC_OPENAI_API_KEY or any client-exposed variable here.
// - If the key is missing, or the model call fails for any reason, this ALWAYS
//   responds 200 with a deterministic safe_fallback pipeline (lib/evieAiFallback.ts) —
//   it must never leave the client with a hard failure just because AI is unavailable.
// - Produces SUGGESTIONS only. Nothing here saves a quest/habit — that only happens when
//   the user taps Save on the client, which routes through the existing validated save
//   helpers in lib/pathPipeline.ts.
// - Do not send the user's raw journal/reflection text to the model — the request body is
//   expected to carry compact summaries (LifeProfile fields, LearningMemory patterns,
//   StatsInsight summaries, AgentEvent metadata), never full log text.

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const MAX_PROMPT_LENGTH = 4000;

const RESPONSE_JSON_SCHEMA = {
  name: "evie_path_pipeline",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "status",
      "guide",
      "goalSummary",
      "goalDomain",
      "specificityScore",
      "clarifyingQuestions",
      "researchBrief",
      "threeMonthDirection",
      "oneMonthMilestone",
      "twoWeekSprint",
      "weeklyHabitSuggestions",
      "dailyQuestSuggestions",
      "lunaRecoveryNotes",
      "safetyNotes",
      "nextBestAction",
    ],
    properties: {
      status: { type: "string", enum: ["ready", "needs_clarification", "safe_fallback"] },
      guide: { type: "string", enum: ["evie"] },
      goalSummary: { type: "string" },
      goalDomain: {
        type: "string",
        enum: ["career", "school", "body", "friendship", "creative", "purpose", "sleep", "other"],
      },
      specificityScore: { type: "number" },
      clarifyingQuestions: { type: "array", items: { type: "string" } },
      researchBrief: {
        type: "object",
        additionalProperties: false,
        required: ["summary", "keySteps", "skillsNeeded", "milestones", "risks", "suggestedResources", "sourceNote"],
        properties: {
          summary: { type: "string" },
          keySteps: { type: "array", items: { type: "string" } },
          skillsNeeded: { type: "array", items: { type: "string" } },
          milestones: { type: "array", items: { type: "string" } },
          risks: { type: "array", items: { type: "string" } },
          suggestedResources: { type: "array", items: { type: "string" } },
          sourceNote: { type: "string" },
        },
      },
      threeMonthDirection: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description", "successSigns"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          successSigns: { type: "array", items: { type: "string" } },
        },
      },
      oneMonthMilestone: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description", "measurableOutcome"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          measurableOutcome: { type: "string" },
        },
      },
      twoWeekSprint: {
        type: "object",
        additionalProperties: false,
        required: ["title", "focus", "steps"],
        properties: {
          title: { type: "string" },
          focus: { type: "string" },
          steps: { type: "array", items: { type: "string" } },
        },
      },
      weeklyHabitSuggestions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "reason", "repeatDays", "mode", "durationMinutes"],
          properties: {
            title: { type: "string" },
            reason: { type: "string" },
            repeatDays: { type: "array", items: { type: "string" } },
            mode: { type: "string", enum: ["progress", "recovery"] },
            durationMinutes: { type: "number" },
          },
        },
      },
      dailyQuestSuggestions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "reason",
            "mode",
            "durationMinutes",
            "suggestedTimeWindow",
            "energyEffect",
            "difficulty",
            "source",
            "acceptanceLabel",
          ],
          properties: {
            title: { type: "string" },
            reason: { type: "string" },
            mode: { type: "string", enum: ["progress", "recovery"] },
            durationMinutes: { type: "number", enum: [15, 30, 45, 60, 120] },
            suggestedTimeWindow: { type: "string" },
            energyEffect: { type: "number" },
            difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
            source: { type: "string", enum: ["user_prompt", "life_profile", "stats_pattern", "research_brief"] },
            acceptanceLabel: { type: "string" },
          },
        },
      },
      lunaRecoveryNotes: { type: "array", items: { type: "string" } },
      safetyNotes: { type: "array", items: { type: "string" } },
      nextBestAction: { type: "string" },
    },
  },
} as const;

const SYSTEM_PROMPT = `You are Evie, MYLIT's success/path/task guide for teens and college students.

Your job: turn the user's OWN prompt about what they're building toward into a realistic,
structured pipeline (research brief, 3-month direction, 1-month milestone, 2-week sprint,
weekly habits, daily quests). The more specific the user's prompt, the more specific and
tailored your plan should be — do not force every goal into a generic template.

Rules you must follow:
- Be ambitious but not overwhelming. Small, repeatable steps beat occasional big pushes.
- Respect MYLIT's mechanics: quests are either "progress" or "recovery" mode; recovery is a
  valid, non-lesser form of progress. Daily quest durationMinutes must be one of 15, 30, 45,
  60, or 120 — 120 (2 hours) should be extremely rare and only for something that would
  realistically be a single big "Today's Quest" push, never routine daily suggestions.
- Never suggest scheduling anything past midnight. Keep suggestedTimeWindow realistic
  (a time of day like "morning", "7:30 PM", or "weekend afternoon").
- If the user's prompt is vague or too short to plan around confidently, set status to
  "needs_clarification" and ask 2-4 short, non-judgmental clarifying questions — but still
  fill in a best-effort, clearly generic plan so the user has something to react to.
- If the prompt is specific enough, set status to "ready".
- Never set status to "safe_fallback" yourself — that value is reserved for MYLIT's own
  deterministic fallback when you are unavailable.
- Do not shame the user for where they currently are.
- Do not claim medical, psychiatric, or therapeutic diagnosis/treatment — MYLIT is
  wellness/productivity support only.
- Do not invent credentials, deadlines, or requirements as guaranteed facts you can't know
  (e.g. "you need a 3.8 GPA to get this job") — hedge anything you're not certain of.
- You do not have live web access. Set researchBrief.sourceNote to make clear this is
  "model-guided starter research", not verified web research.
- Use the provided Life Profile, Learning Memory, Stats Insights, recent Agent Events, and
  energy/mode context to personalize the plan (e.g. shorter quests if the user tends to miss
  long ones, lead with recovery if energy is low, avoid weekdays/times that have been hard).
- Every suggestion you produce is only a SUGGESTION — the app will ask the user to approve
  each one individually before anything becomes an active quest or habit.
- Respect any provided constraints (max minutes today, sleep window, school/work
  constraints, things the user wants to avoid).`;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function buildUserContent(input: EvieAiPathPipelineRequest): string {
  // Compact, structured context only — never raw journal/reflection text.
  const compact = {
    userPrompt: input.userPrompt.slice(0, MAX_PROMPT_LENGTH),
    lifeProfile: input.lifeProfile,
    guideMemory: input.guideMemory,
    learningMemory: input.learningMemory,
    statsInsights: (input.statsInsights ?? []).slice(0, 20).map((i) => ({ id: i.id, category: i.category, summary: i.summary })),
    recentAgentEvents: (input.recentAgentEvents ?? []).slice(0, 40).map((e) => ({
      type: e.type,
      sourcePage: e.sourcePage,
      localDate: e.localDate,
      mode: e.mode,
      durationMinutes: e.durationMinutes,
    })),
    currentEnergy: input.currentEnergy,
    currentMode: input.currentMode,
    availableDays: input.availableDays ?? [],
    constraints: input.constraints ?? {},
  };
  return JSON.stringify(compact);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let body: Partial<EvieAiPathPipelineRequest>;
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

  const userPrompt = isNonEmptyString(body.userPrompt) ? body.userPrompt.slice(0, MAX_PROMPT_LENGTH) : "";
  const lifeProfile = (body.lifeProfile ?? {}) as EvieAiPathPipelineRequest["lifeProfile"];
  const currentEnergy = typeof body.currentEnergy === "number" ? body.currentEnergy : 50;
  const currentMode: EvieAiPathPipelineRequest["currentMode"] =
    body.currentMode === "progress" || body.currentMode === "recovery" ? body.currentMode : "neutral";

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const fallback = buildSafeFallbackEviePipeline({ userPrompt, lifeProfile, currentEnergy, currentMode });
    res.status(200).json(fallback);
    return;
  }

  const request: EvieAiPathPipelineRequest = {
    userPrompt,
    lifeProfile,
    guideMemory: body.guideMemory ?? {},
    learningMemory: body.learningMemory ?? { lastUpdatedAt: new Date(0).toISOString() },
    statsInsights: Array.isArray(body.statsInsights) ? body.statsInsights : [],
    recentAgentEvents: Array.isArray(body.recentAgentEvents) ? body.recentAgentEvents : [],
    currentEnergy,
    currentMode,
    availableDays: body.availableDays,
    constraints: body.constraints,
  };

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserContent(request) },
      ],
      response_format: { type: "json_schema", json_schema: RESPONSE_JSON_SCHEMA },
      temperature: 0.6,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty model response");

    const parsed = JSON.parse(raw) as EvieAiPathPipelineResponse;
    // Defense in depth: force these regardless of what the model returned.
    parsed.guide = "evie";
    if (parsed.status === "safe_fallback") parsed.status = "ready";

    res.status(200).json(parsed);
  } catch (error) {
    console.warn("evie-path-pipeline model call failed:", error instanceof Error ? error.message : error);
    const fallback = buildSafeFallbackEviePipeline({ userPrompt, lifeProfile, currentEnergy, currentMode });
    res.status(200).json(fallback);
  }
}
