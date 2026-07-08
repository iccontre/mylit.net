import { CRISIS_RESOURCE_NOTE } from "./crisisDetection";
import type { AiUnavailableReason, LunaSupportModifierRequest, LunaSupportModifierResponse } from "./agentTypes";

// Deterministic, dependency-free fallback for Luna's AI Support Modifier. Used by the server
// route (api/agents/luna-support-modifier.ts) whenever OPENAI_API_KEY is missing or the model
// call fails — Luna must never crash or leave a struggling user with nothing. Deliberately has
// NO AsyncStorage / React Native imports so it stays safe to run in a plain Node function.
// Mirrors the tone of lib/mylitAgents.ts's buildLunaSupportSummary/buildLunaLearningContext.

export function buildSafeFallbackLunaSupport(
  request: LunaSupportModifierRequest,
  reason: AiUnavailableReason = "missing_key"
): LunaSupportModifierResponse {
  const whatLunaNoticed: string[] = [];

  if (request.recentMisses.length >= 2) {
    whatLunaNoticed.push(`A few quests have been missed lately (${request.recentMisses.length} recently) — that's information, not a failure.`);
  }
  if (request.recentEnergy < 40) {
    whatLunaNoticed.push("Your energy has been running low.");
  }
  if (request.sleepContext.interrupted) {
    whatLunaNoticed.push("Your sleep was interrupted recently.");
  }
  if (typeof request.sleepContext.effectiveSleepMinutes === "number" && request.sleepContext.effectiveSleepMinutes < 360) {
    whatLunaNoticed.push("You've been getting less sleep than usual.");
  }
  if (request.reflectionSummary?.whatGotInTheWay) {
    whatLunaNoticed.push("You reflected on something getting in the way recently — that honesty matters.");
  }

  const recentModeTrend = request.patternContext?.recentModeTrend;
  if (recentModeTrend === "recovery_heavy") {
    whatLunaNoticed.push("Your recent days have leaned Recovery more than Progress — that's valid, not a setback.");
  }

  const todayWeekday = new Date().toLocaleDateString([], { weekday: "long" });
  const todayIsRestOriented = request.patternContext?.weekdayIntensity?.[todayWeekday] === "rest_oriented";
  if (todayIsRestOriented) {
    whatLunaNoticed.push(`You've set ${todayWeekday} as a lighter day yourself — today is a good day to lean into that.`);
  }

  if (request.sleepContext.caffeineTime) {
    whatLunaNoticed.push(`You had caffeine around ${request.sleepContext.caffeineTime} — worth keeping in mind for tonight's wind-down.`);
  }
  if (request.sleepContext.sleepGuideAdherence === "inconsistent") {
    whatLunaNoticed.push("Sleep has been a bit inconsistent against your usual rhythm lately.");
  }

  const overloaded = request.recentEnergy < 40 || request.recentMisses.length >= 2 || recentModeTrend === "recovery_heavy" || todayIsRestOriented;

  const supportMessage = overloaded
    ? "It sounds like things have been harder than usual lately. That's okay — let's lighten the load instead of pushing through."
    : "Thanks for telling Luna what's going on. Here's what she noticed and a few small adjustments that might help.";

  const suggestedPlanAdjustments: LunaSupportModifierResponse["suggestedPlanAdjustments"] = [];
  const firstProgressQuest = request.activeQuests.find((quest) => quest.kind === "progress");
  if (firstProgressQuest && overloaded) {
    suggestedPlanAdjustments.push({
      type: "reduce_duration",
      reason: "Shortening this makes it easier to actually finish today.",
      targetQuestId: firstProgressQuest.id,
    });
    suggestedPlanAdjustments.push({
      type: "swap_progress_for_recovery",
      reason: "Recovery counts as real progress too, especially right now.",
      targetQuestId: firstProgressQuest.id,
    });
  }
  if (request.recentMisses.length >= 3) {
    suggestedPlanAdjustments.push({
      type: "ask_evie_to_rebuild",
      reason: "A few quests in a row haven't fit — Evie can rebuild the plan around what's actually working.",
    });
  }

  const recoveryQuestSuggestions: LunaSupportModifierResponse["recoveryQuestSuggestions"] = overloaded
    ? [
        {
          title: "Take a short recovery break",
          reason: "A small, low-pressure reset — rest counts as progress.",
          durationMinutes: 15,
          energyRestoreEstimate: 2,
        },
      ]
    : [];

  return {
    status: "support_only",
    guide: "luna",
    supportMessage,
    whatLunaNoticed,
    suggestedPlanAdjustments,
    recoveryQuestSuggestions,
    evieHandoffNote: request.recentMisses.length >= 3 ? "If the plan keeps not fitting, Evie can rebuild it around what's realistic right now." : "",
    safetyNote: "This is supportive guidance, not medical or therapy advice. If things feel like more than MYLIT can help with, please reach out to a real person you trust.",
    aiUnavailableReason: reason,
  };
}

/** Fixed, non-AI crisis-safe response — used whenever the user's message matches a self-harm/crisis pattern, regardless of OPENAI_API_KEY. Never generates productivity pressure. */
export function buildCrisisSafeLunaResponse(): LunaSupportModifierResponse {
  return {
    status: "support_only",
    guide: "luna",
    supportMessage:
      "It sounds like you're going through something really heavy right now. You don't have to carry that alone, and you don't have to figure out quests or plans right now either.",
    whatLunaNoticed: ["You shared something serious — that took courage, and it matters more than any quest today."],
    suggestedPlanAdjustments: [],
    recoveryQuestSuggestions: [],
    evieHandoffNote: "",
    safetyNote: CRISIS_RESOURCE_NOTE,
  };
}
