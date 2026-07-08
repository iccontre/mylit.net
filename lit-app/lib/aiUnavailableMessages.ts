import type { AiUnavailableReason } from "./agentTypes";

// Shared client-side copy for surfacing a friendly, non-technical notice whenever a route
// returned its deterministic fallback instead of a real AI result — used by
// EvieAiPathCard/LunaSupportPanel/GuideConversationScreen so the wording stays consistent.

export function friendlyAiUnavailableMessage(reason: AiUnavailableReason, guideLabel: string): string {
  switch (reason) {
    case "quota_exceeded":
      return `${guideLabel}'s guide system is at capacity right now — showing a basic result instead. Try again later.`;
    case "rate_limited":
      return `${guideLabel}'s guide system is busy right now — showing a basic result instead. Try again in a minute.`;
    case "missing_key":
      return `${guideLabel}'s guide system isn't set up yet — showing a basic result instead.`;
    case "error":
    default:
      return `${guideLabel}'s guide system had a hiccup — showing a basic result instead.`;
  }
}
