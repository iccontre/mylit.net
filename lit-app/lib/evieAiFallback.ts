import type {
  AgentEventMode,
  AiUnavailableReason,
  EvieAiDailyQuestSuggestion,
  EvieAiPathPipelineResponse,
  EvieGoalDomain,
  UserLifeProfile,
} from "./agentTypes";

// Deterministic, dependency-free fallback for Evie's AI Path Pipeline. Used by the server
// route (api/agents/evie-path-pipeline.ts) whenever OPENAI_API_KEY is missing or the model
// call fails for any reason — MYLIT must never crash or leave the user with nothing just
// because the AI is unavailable. Deliberately has NO AsyncStorage / React Native imports
// so it stays safe to run in a plain Node serverless function.

const DOMAIN_KEYWORDS: Array<{ domain: EvieGoalDomain; words: RegExp }> = [
  { domain: "career", words: /(job|career|intern|resume|hire|work|industry|company|startup)/i },
  { domain: "school", words: /(school|class|exam|grade|study|college|university|course|major)/i },
  { domain: "body", words: /(gym|workout|fitness|weight|run|health|body|strength|diet)/i },
  { domain: "friendship", words: /(friend|social|relationship|connect|lonely|people)/i },
  { domain: "creative", words: /(art|music|write|creative|design|build|paint|draw|film|game)/i },
  { domain: "sleep", words: /(sleep|rest|energy|burnout|tired|recover)/i },
  { domain: "purpose", words: /(purpose|meaning|identity|future self|who i am|direction)/i },
];

function pickGoalText(userPrompt: string, profile: UserLifeProfile): string {
  const trimmed = userPrompt.trim();
  if (trimmed) return trimmed;
  const fallback =
    profile.longTermDreamStatement?.trim() ||
    profile.futureSelfStatement?.trim() ||
    profile.careerGoals?.trim() ||
    profile.bodyHealthGoals?.trim() ||
    profile.friendshipSocialGoals?.trim() ||
    profile.purposeGoals?.trim() ||
    profile.confidenceGoals?.trim();
  return fallback || "";
}

function pickGoalDomain(text: string): EvieGoalDomain {
  const match = DOMAIN_KEYWORDS.find((entry) => entry.words.test(text));
  return match?.domain ?? "other";
}

function computeSpecificityScore(text: string): number {
  if (!text) return 0;
  const words = text.split(/\s+/).filter(Boolean);
  const hasNumberOrDate = /\d/.test(text);
  let score = Math.min(1, words.length / 25);
  if (hasNumberOrDate) score = Math.min(1, score + 0.15);
  return Math.round(score * 100) / 100;
}

/**
 * Builds a safe_fallback EvieAiPathPipelineResponse using only deterministic templating —
 * no AI call, no network. Mirrors the tone/shape of lib/pathPipeline.ts's deterministic
 * generator but outputs the AI response schema so the client UI can render either path
 * identically.
 */
export function buildSafeFallbackEviePipeline(
  input: {
    userPrompt: string;
    lifeProfile: UserLifeProfile;
    currentEnergy: number;
    currentMode: AgentEventMode;
  },
  reason: AiUnavailableReason = "missing_key"
): EvieAiPathPipelineResponse {
  const goalText = pickGoalText(input.userPrompt, input.lifeProfile);
  const hasGoal = goalText.length > 0;
  const specificityScore = computeSpecificityScore(goalText);
  const vague = !hasGoal || specificityScore < 0.25;
  const goalDomain = pickGoalDomain(goalText);

  const goalSummary = hasGoal
    ? `Working toward: ${goalText}`
    : "No specific goal yet — tell Evie what you're building toward.";

  const clarifyingQuestions = vague
    ? [
        "What's one concrete outcome that would tell you this worked?",
        "What does a normal week look like for the time/energy you can give this?",
        "Is there a deadline or timeframe already in mind, or is this open-ended?",
      ]
    : [];

  const dailyQuestSuggestions: EvieAiDailyQuestSuggestion[] = hasGoal
    ? [
        {
          title: `Small step toward: ${goalText}`,
          reason: "Sized small on purpose so it's easy to actually finish today.",
          mode: "progress",
          durationMinutes: 30,
          suggestedTimeWindow: "afternoon",
          energyEffect: -3,
          difficulty: "easy",
          source: input.userPrompt.trim() ? "user_prompt" : "life_profile",
          acceptanceLabel: "Add to today's quests",
        },
      ]
    : [];

  if (input.currentEnergy < 40) {
    dailyQuestSuggestions.push({
      title: "Take a short recovery break",
      reason: "Your energy is running low — rest counts as real progress too.",
      mode: "recovery",
      durationMinutes: 15,
      suggestedTimeWindow: "afternoon",
      energyEffect: 4,
      difficulty: "easy",
      source: "life_profile",
      acceptanceLabel: "Add to today's quests",
    });
  }

  return {
    status: "safe_fallback",
    guide: "evie",
    goalSummary,
    goalDomain,
    specificityScore,
    clarifyingQuestions,
    researchBrief: {
      summary: hasGoal
        ? `A starting structure for "${goalText}" built from MYLIT's own planner (no AI available right now).`
        : "No goal text yet, so there's nothing to research.",
      keySteps: hasGoal ? ["Pick one repeatable weekly action.", "Track it for two weeks before judging progress."] : [],
      skillsNeeded: [],
      milestones: hasGoal ? [`One month: take a real first step toward "${goalText}".`] : [],
      risks: ["Plans built without AI are more generic — expect to adjust as you go."],
      suggestedResources: [],
      sourceNote: "Generated by MYLIT's built-in planner (AI unavailable right now) — a starting structure, not verified research.",
    },
    threeMonthDirection: {
      title: hasGoal ? `Keep moving toward: ${goalText}` : "Set a direction",
      description: hasGoal
        ? "Consistency over intensity — small repeatable steps beat occasional big pushes."
        : "Tell Evie what you're building toward so she can shape a 3-month direction around it.",
      successSigns: hasGoal ? ["You're still doing the weekly habit in week 3.", "You can name one concrete thing that improved."] : [],
    },
    oneMonthMilestone: {
      title: hasGoal ? `This month: one concrete step toward "${goalText}"` : "Not set yet",
      description: hasGoal
        ? "Pick the single most important skill, habit, or connection this goal needs right now, and practice it weekly."
        : "",
      measurableOutcome: hasGoal ? "You can point to one specific thing you built, practiced, or changed this month." : "",
    },
    twoWeekSprint: {
      title: hasGoal ? `Next 2 weeks: build one repeatable habit for "${goalText}"` : "Not set yet",
      focus: hasGoal ? "Pick one repeatable action you can realistically keep up for two weeks." : "",
      steps: hasGoal ? ["Choose the action.", "Do it at the same time each day it's scheduled.", "Adjust size, not frequency, if it's too hard."] : [],
    },
    weeklyHabitSuggestions: hasGoal
      ? [
          {
            title: `Work toward: ${goalText}`,
            reason: "One repeatable weekly touchpoint keeps this moving without overloading your schedule.",
            repeatDays: ["Monday", "Wednesday", "Friday"],
            mode: "progress",
            durationMinutes: 30,
          },
        ]
      : [],
    dailyQuestSuggestions,
    lunaRecoveryNotes:
      input.currentEnergy < 40
        ? ["Your energy's been lower lately — a lighter, more recovery-leaning day or two is a good call, not a setback."]
        : ["Rest counts as progress too — keep at least one recovery activity in reach this week."],
    safetyNotes: [
      "This is guidance, not a guarantee — adjust anything that doesn't fit your life.",
      "MYLIT is wellness/productivity support, not medical, therapy, or diagnostic advice.",
    ],
    nextBestAction: hasGoal
      ? `Try the small step: ${dailyQuestSuggestions[0]?.title ?? goalSummary}`
      : "Write a specific goal into the prompt above so Evie has something to build around.",
    aiUnavailableReason: reason,
  };
}
