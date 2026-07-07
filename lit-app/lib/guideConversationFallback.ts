import { CRISIS_RESOURCE_NOTE } from "./crisisDetection";
import type { GuideConversationResponse, GuideName } from "./agentTypes";

// Deterministic, dependency-free fallback for Guide Conversation Memory. Used by
// api/agents/guide-conversation.ts whenever OPENAI_API_KEY is missing or the model call
// fails. Deliberately never proposes a memory update — without a model, MYLIT cannot safely
// infer a structured summary from free text, so the safe default is "listen, don't guess."

const GENERIC_SAFETY_NOTE =
  "This is supportive guidance, not medical or therapy advice. If something feels like more than MYLIT can help with, please reach out to a real person you trust.";

export function buildFallbackGuideConversationResponse(guide: GuideName): GuideConversationResponse {
  const reply =
    guide === "evie"
      ? "Thanks for sharing that. Evie's AI planning brain isn't reachable right now, so she can't turn this into a plan update yet — try again in a bit, or use \"Ask Evie to Build My Path\" on the Path screen."
      : "Thanks for telling Luna what's going on. Her AI support brain isn't reachable right now, so she can't suggest adjustments from this yet — try again in a bit, or use \"Ask Luna to help me adjust\" on the Mind screen.";

  return {
    guide,
    reply,
    memoryUpdateProposals: [],
    safetyNote: GENERIC_SAFETY_NOTE,
  };
}

/** Fixed, non-AI crisis-safe reply — used whenever the user's message matches a self-harm/crisis pattern, regardless of which guide or OPENAI_API_KEY. Never generates a memory-update proposal or productivity pressure. */
export function buildCrisisSafeGuideConversationResponse(guide: GuideName): GuideConversationResponse {
  return {
    guide,
    reply:
      "It sounds like you're going through something really heavy right now. You don't have to carry that alone, and you don't have to think about goals or plans right now either.",
    memoryUpdateProposals: [],
    safetyNote: CRISIS_RESOURCE_NOTE,
  };
}
