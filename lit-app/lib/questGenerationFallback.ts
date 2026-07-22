import { generateProgressQuests, generateRecoveryQuests, generateQuestFromMorningIntent } from "./questGeneration";
import { getEnergyDelta } from "./scheduling";
import type { AiUnavailableReason, GeneratedQuestProposal, QuestGenerationContext, QuestGenerationResult } from "./agentTypes";

// Deterministic, dependency-free fallback for the shared quest-generation contract. Used by
// the server route (api/agents/quest-generation.ts) whenever OPENAI_API_KEY is missing or the
// model call fails — MYLIT must never leave a check-in/onboarding screen with nothing just
// because AI is unavailable. Builds on the SAME template-based generators every other quest
// suggestion in the app already uses (lib/questGeneration.ts) — no parallel quest-generation
// system. lib/questGeneration.ts sources its "today" key from lib/scheduling.ts (not
// lib/questProgress.ts) specifically so this whole chain stays AsyncStorage/React-Native-free
// and safe to run in a plain Node serverless function.

const DURATION_LADDER = [15, 30, 45, 60] as const;

function stepDuration(minutes: number, direction: 1 | -1): 15 | 30 | 45 | 60 {
  const index = DURATION_LADDER.findIndex((step) => step >= minutes);
  const clampedIndex = index === -1 ? DURATION_LADDER.length - 1 : index;
  const nextIndex = Math.min(DURATION_LADDER.length - 1, Math.max(0, clampedIndex + direction));
  return DURATION_LADDER[nextIndex];
}

function goalAnchor(context: QuestGenerationContext): string {
  return (
    context.intention?.trim() ||
    context.milestones?.description?.trim() ||
    context.milestones?.twoWeek?.trim() ||
    context.milestones?.longTermDream?.trim() ||
    "your goal"
  );
}

function buildMorningProposals(context: QuestGenerationContext): GeneratedQuestProposal[] {
  const intention = context.intention?.trim();
  if (!intention) return [];

  const base = generateQuestFromMorningIntent(intention);
  const baseDuration = base.durationMinutes ?? 30;
  const kind = base.kind ?? "progress";
  const variantGroup = `morning-${context.logicalDayKey}`;

  const pushDuration = stepDuration(baseDuration, 1);
  const focusedDuration = stepDuration(baseDuration, -1);

  return [
    {
      proposalId: `${context.requestId}-push`,
      title: base.title,
      description: "A bigger push toward the same goal.",
      mode: kind,
      durationMinutes: pushDuration,
      energyCost: getEnergyDelta({ kind, durationMinutes: pushDuration }),
      rationale: "More time and effort on the same intention, while staying realistic for today.",
      sourceLabel: "Suggested by Evie from today's intention",
      variantGroup,
      variantLabel: "push_forward",
    },
    {
      proposalId: `${context.requestId}-focused`,
      title: base.title,
      description: "The most important part of the same goal, in less time.",
      mode: kind,
      durationMinutes: focusedDuration,
      energyCost: getEnergyDelta({ kind, durationMinutes: focusedDuration }),
      rationale: "A shorter, focused version that still moves the same goal forward.",
      sourceLabel: "Suggested by Evie from today's intention",
      variantGroup,
      variantLabel: "focused_pace",
    },
  ];
}

function buildAfternoonProposals(context: QuestGenerationContext): GeneratedQuestProposal[] {
  const anchor = goalAnchor(context);
  const variantGroup = `afternoon-${context.logicalDayKey}`;
  const availableMinutes = context.availableMinutes ?? 60;
  const proposals: GeneratedQuestProposal[] = [];

  if (availableMinutes >= 15) {
    const [progress] = generateProgressQuests({ category: "", specificGoal: anchor }, 1);
    if (progress) {
      const duration = Math.min(progress.durationMinutes ?? 30, availableMinutes >= 45 ? 30 : 15);
      proposals.push({
        proposalId: `${context.requestId}-progress`,
        title: progress.title,
        description: progress.description ?? "One focused, useful step for the rest of today.",
        mode: "progress",
        durationMinutes: duration,
        energyCost: getEnergyDelta({ kind: "progress", durationMinutes: duration }),
        rationale: "The most useful remaining action given today's intention and your remaining time.",
        sourceLabel: "Suggested by Evie from today's progress",
        variantGroup,
        variantLabel: "progress",
      });
    }
  }

  const [recovery] = generateRecoveryQuests({ category: "", specificGoal: anchor }, 1);
  if (recovery) {
    const duration = Math.min(recovery.durationMinutes ?? 30, availableMinutes);
    proposals.push({
      proposalId: `${context.requestId}-recovery`,
      title: recovery.title,
      description: recovery.description ?? "A short recovery step to protect the rest of your day.",
      mode: "recovery",
      durationMinutes: Math.max(15, duration),
      energyCost: getEnergyDelta({ kind: "recovery", durationMinutes: Math.max(15, duration) }),
      rationale: "Recovery now protects tonight's sleep and tomorrow's energy.",
      sourceLabel: "Recovery suggested by Luna",
      variantGroup,
      variantLabel: "recovery",
    });
  }

  return proposals;
}

function buildOnboardingWeekProposals(context: QuestGenerationContext): GeneratedQuestProposal[] {
  const anchor = goalAnchor(context);
  const dates = context.targetWeekDates ?? [];
  const proposals: GeneratedQuestProposal[] = [];

  dates.forEach((dateKey, index) => {
    const variantGroup = `week-${dateKey}`;
    const progressPool = generateProgressQuests({ category: "", specificGoal: anchor }, dates.length);
    const progress = progressPool[index % Math.max(1, progressPool.length)];
    if (progress) {
      proposals.push({
        proposalId: `${context.requestId}-${dateKey}-progress`,
        title: progress.title,
        description: progress.description ?? "One concrete step toward your milestones this week.",
        mode: "progress",
        durationMinutes: index < 2 ? 15 : (progress.durationMinutes ?? 30),
        energyCost: getEnergyDelta({ kind: "progress", durationMinutes: progress.durationMinutes ?? 30 }),
        rationale: "Connects to your 2-week milestone with a short, realistic step.",
        sourceLabel: "Suggested by Evie from your Path",
        targetDateKey: dateKey,
        variantGroup,
        variantLabel: "progress",
      });
    }

    const recoveryPool = generateRecoveryQuests({ category: "", specificGoal: anchor }, dates.length);
    const recovery = recoveryPool[index % Math.max(1, recoveryPool.length)];
    if (recovery) {
      proposals.push({
        proposalId: `${context.requestId}-${dateKey}-recovery`,
        title: recovery.title,
        description: recovery.description ?? "A short recovery step to keep the week sustainable.",
        mode: "recovery",
        durationMinutes: recovery.durationMinutes ?? 30,
        energyCost: getEnergyDelta({ kind: "recovery", durationMinutes: recovery.durationMinutes ?? 30 }),
        rationale: "Recovery is part of a sustainable week, not a setback.",
        sourceLabel: "Recovery suggested by Luna",
        targetDateKey: dateKey,
        variantGroup,
        variantLabel: "recovery",
      });
    }
  });

  return proposals;
}

export function buildFallbackQuestGeneration(context: QuestGenerationContext, reason: AiUnavailableReason): QuestGenerationResult {
  let proposals: GeneratedQuestProposal[] = [];
  if (context.source === "morning_checkin") proposals = buildMorningProposals(context);
  else if (context.source === "afternoon_checkin") proposals = buildAfternoonProposals(context);
  else if (context.source === "onboarding_week") proposals = buildOnboardingWeekProposals(context);

  return {
    requestId: context.requestId,
    proposals,
    generatedAt: new Date().toISOString(),
    contextVersion: "1",
    aiUnavailableReason: reason,
  };
}
