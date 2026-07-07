import AsyncStorage from "@react-native-async-storage/async-storage";

import { loadUserLifeProfile, loadGuideMemory, loadLearningMemory, buildStatsInsightSnapshot, saveUserLifeProfile, saveGuideMemory, recordAgentEvent } from "./mylitAgents";
import { persistProgressKeys } from "./progressStore";
import { GUIDE_CONVERSATIONS_KEY, GUIDE_MEMORY_UPDATES_KEY, LATEST_CHECKIN_KEY } from "./storageKeys";
import type {
  AgentEventMode,
  GuideConversationRequest,
  GuideConversationResponse,
  GuideConversationTurn,
  GuideMemoryUpdateLogEntry,
  GuideMemoryUpdateProposal,
  GuideName,
} from "./agentTypes";

// Client-safe helper for Guide Conversation Memory. Calls the server-only route at
// /api/agents/guide-conversation — never touches an API key. A conversation can only ever
// affect stored memory through decideMemoryUpdateProposal, which always requires an explicit
// user decision (approve/dismiss) and can never create or delete a quest/habit.

const TURNS_CAP_PER_GUIDE = 40;
const RECENT_TURNS_SENT = 8;
const RECENT_TURN_MAX_LENGTH = 500;
const MEMORY_UPDATES_LOG_CAP = 100;
const REQUEST_TIMEOUT_MS = 45000;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

async function loadAllConversationTurns(): Promise<GuideConversationTurn[]> {
  return readJson<GuideConversationTurn[]>(GUIDE_CONVERSATIONS_KEY, []);
}

async function saveAllConversationTurns(turns: GuideConversationTurn[]): Promise<void> {
  await persistProgressKeys({ [GUIDE_CONVERSATIONS_KEY]: JSON.stringify(turns) });
}

/** Trims only the oldest turns belonging to `guide` beyond `cap` — the other guide's history is untouched. */
function capPerGuideHistory(all: GuideConversationTurn[], guide: GuideName, cap: number): GuideConversationTurn[] {
  const guideIndexes = all.map((turn, index) => ({ turn, index })).filter((entry) => entry.turn.guide === guide);
  if (guideIndexes.length <= cap) return all;
  const dropCount = guideIndexes.length - cap;
  const dropIndexes = new Set(guideIndexes.slice(0, dropCount).map((entry) => entry.index));
  return all.filter((_, index) => !dropIndexes.has(index));
}

/** Full conversation for one guide, oldest-first. */
export async function loadGuideConversation(guide: GuideName): Promise<GuideConversationTurn[]> {
  const all = await loadAllConversationTurns();
  return all.filter((turn) => turn.guide === guide);
}

async function loadCurrentModeContext(): Promise<AgentEventMode> {
  const checkIn = await readJson<{ mode?: string } | null>(LATEST_CHECKIN_KEY, null);
  if (!checkIn) return "neutral";
  return checkIn.mode === "Recovery" ? "recovery" : "progress";
}

export type SendGuideMessageResult =
  | { ok: true; userTurn: GuideConversationTurn; guideTurn: GuideConversationTurn }
  | { ok: false; error: string };

/** Sends one message in a guide's conversation and appends both the user + guide turns to storage. */
export async function sendGuideMessage(guide: GuideName, userMessage: string): Promise<SendGuideMessageResult> {
  const trimmed = userMessage.trim();
  if (!trimmed) return { ok: false, error: "Type something first." };

  const [existingConversation, lifeProfile, guideMemory, learningMemory, statsInsights, currentMode] = await Promise.all([
    loadGuideConversation(guide),
    loadUserLifeProfile(),
    loadGuideMemory(),
    loadLearningMemory(),
    buildStatsInsightSnapshot(),
    loadCurrentModeContext(),
  ]);

  const recentTurns = existingConversation.slice(-RECENT_TURNS_SENT).map((turn) => ({
    role: turn.role,
    text: turn.text.slice(0, RECENT_TURN_MAX_LENGTH),
  }));

  const request: GuideConversationRequest = {
    guide,
    userMessage: trimmed,
    recentTurns,
    lifeProfile,
    guideMemory,
    learningMemory,
    statsInsights,
    currentMode,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: GuideConversationResponse;
  try {
    const res = await fetch("/api/agents/guide-conversation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, error: `${guide === "evie" ? "Evie" : "Luna"} couldn't reach her conversation brain right now — try again in a moment.` };
    }
    response = (await res.json()) as GuideConversationResponse;
  } catch {
    return { ok: false, error: `${guide === "evie" ? "Evie" : "Luna"} couldn't reach her conversation brain right now — check your connection and try again.` };
  } finally {
    clearTimeout(timeout);
  }

  const now = new Date().toISOString();
  const userTurn: GuideConversationTurn = {
    id: `guide-turn-${Date.now()}-user`,
    guide,
    role: "user",
    text: trimmed,
    createdAt: now,
  };
  const guideTurn: GuideConversationTurn = {
    id: `guide-turn-${Date.now()}-guide`,
    guide,
    role: "guide",
    text: response.reply,
    createdAt: new Date().toISOString(),
    memoryUpdateProposals: response.memoryUpdateProposals.map((proposal, index) => ({
      id: `proposal-${Date.now()}-${index}`,
      type: proposal.type,
      summary: proposal.summary,
      proposedValue: proposal.proposedValue,
    })),
  };

  const all = await loadAllConversationTurns();
  const next = capPerGuideHistory([...all, userTurn, guideTurn], guide, TURNS_CAP_PER_GUIDE);
  await saveAllConversationTurns(next);

  void recordAgentEvent({
    type: "path_updated",
    sourcePage: "guide-conversation",
    relatedItemId: guideTurn.id,
    mode: currentMode,
    metadata: { action: "guide_conversation_turn", guide },
  });

  return { ok: true, userTurn, guideTurn };
}

// ---------------------------------------------------------------------------
// Memory update decisions — the ONLY way a conversation can affect stored memory. Every
// approval maps onto an existing UserLifeProfile/GuideMemory field via the same
// saveUserLifeProfile/saveGuideMemory helpers the rest of the app already uses (shallow
// merge — never wipes fields the user didn't just change). Never touches a quest/habit.
// ---------------------------------------------------------------------------

function classifyMotivationStyle(text: string): "gentle" | "direct" | "balanced" {
  const lower = text.toLowerCase();
  if (/(direct|blunt|push me|tough|no[- ]nonsense|straightforward)/.test(lower)) return "direct";
  if (/(gentle|soft|kind|patient|understanding|easy on me)/.test(lower)) return "gentle";
  return "balanced";
}

async function applyApprovedMemoryUpdate(guide: GuideName, proposal: GuideMemoryUpdateProposal): Promise<string | undefined> {
  switch (proposal.type) {
    case "new_goal":
    case "changed_goal":
      await saveUserLifeProfile({ longTermDreamStatement: proposal.proposedValue });
      return "longTermDreamStatement";
    case "obstacle":
      await saveUserLifeProfile({ currentObstacles: proposal.proposedValue });
      return "currentObstacles";
    case "preference":
      if (guide === "evie") {
        await saveUserLifeProfile({ preferredEvieAccountability: proposal.proposedValue });
        return "preferredEvieAccountability";
      }
      await saveUserLifeProfile({ preferredLunaSupport: proposal.proposedValue });
      return "preferredLunaSupport";
    case "recovery_need":
      await saveUserLifeProfile({ recoveryActivitiesThatHelp: proposal.proposedValue });
      return "recoveryActivitiesThatHelp";
    case "motivation_style":
      await saveUserLifeProfile({ motivationStyle: classifyMotivationStyle(proposal.proposedValue) });
      return "motivationStyle";
    case "task_adjustment_request":
      // Never touches a task directly — just remembered as a note so Evie/Luna's existing,
      // separately-validated tools (Ask Evie to Build My Path / Ask Luna to help me adjust)
      // can factor it in next time the user uses them.
      await saveGuideMemory({ notes: proposal.proposedValue });
      return "guideMemory.notes";
    default:
      return undefined;
  }
}

export type DecideMemoryUpdateResult = { ok: boolean; appliedToField?: string };

/** The only path by which a conversation can affect stored memory — always an explicit user decision. */
export async function decideMemoryUpdateProposal(
  guide: GuideName,
  turnId: string,
  proposalId: string,
  decision: "approved" | "dismissed"
): Promise<DecideMemoryUpdateResult> {
  const all = await loadAllConversationTurns();
  const turnIndex = all.findIndex((turn) => turn.id === turnId);
  if (turnIndex === -1) return { ok: false };

  const turn = all[turnIndex];
  const proposalIndex = (turn.memoryUpdateProposals ?? []).findIndex((proposal) => proposal.id === proposalId);
  if (proposalIndex === -1) return { ok: false };

  const proposal = turn.memoryUpdateProposals![proposalIndex];
  if (proposal.decision) return { ok: false };

  let appliedToField: string | undefined;
  if (decision === "approved") {
    appliedToField = await applyApprovedMemoryUpdate(guide, proposal);
  }

  const decidedAt = new Date().toISOString();
  const nextProposals = [...turn.memoryUpdateProposals!];
  nextProposals[proposalIndex] = { ...proposal, decision, decidedAt };
  const nextTurns = [...all];
  nextTurns[turnIndex] = { ...turn, memoryUpdateProposals: nextProposals };
  await saveAllConversationTurns(nextTurns);

  const logEntry: GuideMemoryUpdateLogEntry = {
    id: `guide-memory-update-${Date.now()}`,
    guide,
    type: proposal.type,
    summary: proposal.summary,
    proposedValue: proposal.proposedValue,
    decision,
    appliedToField,
    sourceTurnId: turnId,
    decidedAt,
  };
  const existingLog = await readJson<GuideMemoryUpdateLogEntry[]>(GUIDE_MEMORY_UPDATES_KEY, []);
  const nextLog = [logEntry, ...existingLog].slice(0, MEMORY_UPDATES_LOG_CAP);
  await persistProgressKeys({ [GUIDE_MEMORY_UPDATES_KEY]: JSON.stringify(nextLog) });

  return { ok: true, appliedToField };
}
