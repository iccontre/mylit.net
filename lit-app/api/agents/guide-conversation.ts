import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

import { matchesCrisisLanguage } from "../../lib/crisisDetection";
import { buildCrisisSafeGuideConversationResponse, buildFallbackGuideConversationResponse } from "../../lib/guideConversationFallback";
import { classifyAiError, logAiUsage } from "../../lib/aiUsageLog";
import type { GuideConversationRequest, GuideConversationResponse, GuideName } from "../../lib/agentTypes";

const ROUTE_NAME = "guide-conversation";

// Server-only route: lightweight guided conversation memory for Evie ("Talk to Evie about my
// path") and Luna ("Talk to Luna about what feels hard"). Deliberately NOT an unrestricted
// chatbot:
//
// - A conversation can only ever affect stored memory through a structured update proposal
//   (new_goal, changed_goal, obstacle, preference, recovery_need, motivation_style,
//   task_adjustment_request) that the user explicitly approves client-side — this route never
//   writes anything itself.
// - This route can NEVER create or delete a quest/habit — that only ever happens through the
//   existing, separately-validated Evie/Luna pipelines (lib/pathPipeline.ts,
//   lib/lunaSupportModifier.ts). task_adjustment_request is only ever a remembered note.
// - Crisis/self-harm language is checked deterministically before anything else (including
//   before the OPENAI_API_KEY check) and bypasses the model entirely, for BOTH guides.
// - Reads OPENAI_API_KEY from environment variables ONLY — never EXPO_PUBLIC_OPENAI_API_KEY.
// - Only compact structured context + a few recent turns are sent to the model — never a full
//   conversation history or raw journal/reflection text.

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const MAX_MESSAGE_LENGTH = 4000;
const MAX_RECENT_TURNS = 8;

const MEMORY_UPDATE_TYPES = [
  "new_goal",
  "changed_goal",
  "obstacle",
  "preference",
  "recovery_need",
  "motivation_style",
  "task_adjustment_request",
] as const;

function buildResponseSchema(guide: GuideName) {
  return {
    name: "guide_conversation",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["guide", "reply", "memoryUpdateProposals", "safetyNote"],
      properties: {
        guide: { type: "string", enum: [guide] },
        reply: { type: "string" },
        memoryUpdateProposals: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["type", "summary", "proposedValue"],
            properties: {
              type: { type: "string", enum: MEMORY_UPDATE_TYPES },
              summary: { type: "string" },
              proposedValue: { type: "string" },
            },
          },
        },
        safetyNote: { type: "string" },
      },
    },
  } as const;
}

const SHARED_RULES = `Rules you must follow, no matter which guide you are:
- You are having a short, focused conversation — not an open-ended chatbot. Stay warm and
  natural, but keep replies short (2-4 sentences) and on-topic.
- You can NEVER create, delete, or directly modify a quest, habit, or task. If the user asks
  for that, tell them which existing MYLIT tool does it (Evie: "Ask Evie to Build My Path" on
  the Path screen. Luna: "Ask Luna to help me adjust" on the Mind screen) and, if relevant,
  propose a "task_adjustment_request" memory update so that tool has more context next time.
- You can only affect MYLIT's stored memory by proposing a memoryUpdateProposals entry — the
  app will always ask the user to approve it before anything is saved. Never claim you've
  already saved or changed something.
- Only propose a memory update when you're genuinely confident you noticed one of: a new goal,
  a changed goal, an obstacle, a preference (how the user wants you to communicate/support
  them), a recovery need, a shift in motivation style (gentle/direct/balanced), or an explicit
  request to adjust their tasks/plan. Do not invent one just to have something to propose.
- proposedValue must be the actual concrete value to remember (e.g. the goal text itself, not
  "the user's goal"), summary must be a short human-readable sentence framed as a question,
  e.g. "Sounds like your goal changed to: <value>. Save this?"
- Do not claim medical, psychiatric, or therapeutic diagnosis/treatment — MYLIT is
  wellness/productivity support only, not a substitute for professional care.
- Do not shame the user for anything they share.
- patternContext, when present, is a compact read on the user's own rhythm (which weekdays
  they've marked as rest-oriented via their own Weekly Habit, their recent Recovery-vs-Progress
  trend, which task categories they complete vs miss, and their work-rhythm preference) — use
  it to make the conversation feel like it already knows the user, never to lecture them
  about it.`;

const EVIE_SYSTEM_PROMPT = `You are Evie, MYLIT's success/path/task guide, talking with the user about their path.

${SHARED_RULES}

Evie-specific: be encouraging and a little ambitious, but never overwhelming. Focus the
conversation on their goals, direction, obstacles, and how they like to be held accountable.`;

const LUNA_SYSTEM_PROMPT = `You are Luna, MYLIT's support and recovery guide, talking with the user about what feels hard.

${SHARED_RULES}

Luna-specific: be gentle and recovery-focused. Recovery is valid progress, not a lesser
choice. Focus the conversation on what's hard right now, what recovery/support looks like for
them, and their motivation style — never push productivity.`;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function buildUserContent(input: GuideConversationRequest): string {
  // Compact, structured context + a few recent turns only — never the full conversation
  // history or raw journal/reflection text.
  const compact = {
    userMessage: input.userMessage.slice(0, MAX_MESSAGE_LENGTH),
    recentTurns: input.recentTurns.slice(-MAX_RECENT_TURNS).map((turn) => ({ role: turn.role, text: turn.text.slice(0, 500) })),
    lifeProfile: input.lifeProfile,
    guideMemory: input.guideMemory,
    learningMemory: input.learningMemory,
    statsInsights: (input.statsInsights ?? []).slice(0, 10).map((i) => ({ id: i.id, category: i.category, summary: i.summary })),
    currentMode: input.currentMode,
    patternContext: input.patternContext ?? {},
  };
  return JSON.stringify(compact);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let body: Partial<GuideConversationRequest>;
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

  const guide: GuideName = body.guide === "luna" ? "luna" : "evie";
  const userMessage = isNonEmptyString(body.userMessage) ? body.userMessage.slice(0, MAX_MESSAGE_LENGTH) : "";

  // Crisis check runs first, deterministically, for BOTH guides, before anything else —
  // including before the OPENAI_API_KEY check. It must never depend on AI being configured.
  if (userMessage && matchesCrisisLanguage(userMessage)) {
    res.status(200).json(buildCrisisSafeGuideConversationResponse(guide));
    return;
  }

  const request: GuideConversationRequest = {
    guide,
    userMessage,
    recentTurns: Array.isArray(body.recentTurns) ? body.recentTurns : [],
    lifeProfile: body.lifeProfile ?? {},
    guideMemory: body.guideMemory ?? {},
    learningMemory: body.learningMemory ?? { lastUpdatedAt: new Date(0).toISOString() },
    statsInsights: Array.isArray(body.statsInsights) ? body.statsInsights : [],
    currentMode: body.currentMode === "progress" || body.currentMode === "recovery" ? body.currentMode : "neutral",
    patternContext: body.patternContext,
  };

  const userContent = buildUserContent(request);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logAiUsage({ route: ROUTE_NAME, promptChars: userContent.length, ok: false, reason: "missing_key" });
    res.status(200).json(buildFallbackGuideConversationResponse(guide, "missing_key"));
    return;
  }

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: guide === "luna" ? LUNA_SYSTEM_PROMPT : EVIE_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_schema", json_schema: buildResponseSchema(guide) },
      temperature: 0.6,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty model response");

    logAiUsage({ route: ROUTE_NAME, promptChars: userContent.length, completionChars: raw.length, ok: true });

    const parsed = JSON.parse(raw) as GuideConversationResponse;
    // Defense in depth: force this regardless of what the model returned.
    parsed.guide = guide;
    parsed.memoryUpdateProposals = (parsed.memoryUpdateProposals ?? []).filter((proposal) =>
      (MEMORY_UPDATE_TYPES as readonly string[]).includes(proposal.type)
    );

    res.status(200).json(parsed);
  } catch (error) {
    const reason = classifyAiError(error);
    console.warn("guide-conversation model call failed:", error instanceof Error ? error.message : error);
    logAiUsage({ route: ROUTE_NAME, promptChars: userContent.length, ok: false, reason });
    res.status(200).json(buildFallbackGuideConversationResponse(guide, reason));
  }
}
