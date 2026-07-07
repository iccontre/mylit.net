// Shared crisis/self-harm language guardrail used by every guide-facing AI route
// (api/agents/luna-support-modifier.ts, api/agents/guide-conversation.ts). Deliberately
// dependency-free and pure so it can run in a plain Node serverless function. This check
// always runs BEFORE any model call and BEFORE any "is the API key configured" branch — it
// must never depend on AI being available or working.

// Deliberately conservative/explicit phrases only — false negatives here fall through to a
// normal supportive response (which is still gentle and non-pressuring), so there is no
// safety cost to keeping this list narrow and avoiding disruptive false positives.
export const CRISIS_PATTERNS: RegExp[] = [
  /\bkill myself\b/i,
  /\bwant(ed)? to die\b/i,
  /\bend(ing)? my life\b/i,
  /\bsuicid(e|al)\b/i,
  /\bhurt(ing)? myself\b/i,
  /\bself[\s-]?harm\b/i,
  /\bdon'?t want to (be alive|live anymore)\b/i,
  /\bno reason to live\b/i,
  /\bbetter off (dead|without me)\b/i,
];

export function matchesCrisisLanguage(text: string): boolean {
  return CRISIS_PATTERNS.some((pattern) => pattern.test(text));
}

export const CRISIS_RESOURCE_NOTE =
  "MYLIT isn't able to provide crisis support, but you deserve real help right now. In the US, you can call or text 988 (Suicide & Crisis Lifeline) anytime, or text HOME to 741741 (Crisis Text Line). If you're in immediate danger, please call 911 or your local emergency number.";
