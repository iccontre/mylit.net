import AsyncStorage from "@react-native-async-storage/async-storage";

import { clearProgressKey, persistProgressKeys } from "./progressStore";
import {
  ACTIVE_TIMED_ITEM_KEY,
  COMPLETED_QUESTS_KEY,
  DAY_PLAN_KEY,
  FOCUS_BLOCK_HISTORY_KEY,
  MISSED_QUESTS_KEY,
  TODAY_PROGRESS_DATE_KEY,
  TOMORROW_QUEUE_KEY,
  USER_STATS_KEY,
  TOTAL_STEPS_FLOOR_KEY,
} from "./storageKeys";
import {
  collectDayPlanScheduledItems,
  collectQuickThoughtScheduledItems,
  FORCED_RECOVERY_DURATION_MINUTES,
  FORCED_RECOVERY_MESSAGE,
  FORCED_RECOVERY_RESTORE_ENERGY,
  FORCED_RECOVERY_TITLE,
  formatDurationLabel,
  getDateKey,
  getStepsForDuration,
  getStepsForItem,
  inferScheduledClassification,
  isScheduledItemExpired,
  parseDurationMinutes,
  parseTimeToMinutes,
  TODAY_QUEST_DURATION_MINUTES,
  TODAY_QUEST_STEPS,
  type ScheduledQuestLike,
  type WeekdayName,
} from "./scheduling";

// These keys are defined in storageKeys.ts (a near-leaf module) and re-exported here
// to keep existing `import { ... } from "./questProgress"` call sites working while
// avoiding the questProgress -> progressStore -> storageKeys -> questProgress cycle.
export {
  ACTIVE_TIMED_ITEM_KEY,
  COMPLETED_QUESTS_KEY,
  DAY_PLAN_KEY,
  FOCUS_BLOCK_HISTORY_KEY,
  MISSED_QUESTS_KEY,
  TODAY_PROGRESS_DATE_KEY,
  TOMORROW_QUEUE_KEY,
  USER_STATS_KEY,
  TOTAL_STEPS_FLOOR_KEY,
};
export {
  FORCED_RECOVERY_DURATION_MINUTES,
  FORCED_RECOVERY_MESSAGE,
  FORCED_RECOVERY_RESTORE_ENERGY,
  FORCED_RECOVERY_TITLE,
  TODAY_QUEST_TWO_HOUR_MINUTES,
} from "./scheduling";

/** Progress mode allows up to 8 planned hours; Recovery mode allows up to 5. */
export const PROGRESS_CAPACITY_MINUTES = 8 * 60;
export const RECOVERY_CAPACITY_MINUTES = 5 * 60;

/**
 * Within the total day cap, only part of it can be PROGRESS work — the rest is reserved
 * for recovery: Progress mode allows up to 5h30 of progress (leaving 2h30 reserved of the
 * 8h total); Recovery mode allows up to 3h of progress (leaving 2h reserved of the 5h
 * total). Recovery-kind work is never limited by this sub-cap — only the total cap applies
 * to it. This is also what naturally enforces "lock new progress once energy drops below
 * 60 with >3h progress already done": once energy dips below 60 the app's live mode
 * recomputes to Recovery, and its 3h progress sub-cap immediately applies to that day's
 * already-completed/scheduled progress total.
 */
export const PROGRESS_MODE_MAX_PROGRESS_MINUTES = 5 * 60 + 30;
export const RECOVERY_MODE_MAX_PROGRESS_MINUTES = 3 * 60;

export function getMaxProgressMinutes(mode: "Progress" | "Recovery"): number {
  return mode === "Recovery" ? RECOVERY_MODE_MAX_PROGRESS_MINUTES : PROGRESS_MODE_MAX_PROGRESS_MINUTES;
}

/** @deprecated Item-count capacity — use minute-based capacity helpers instead. */
export const PROGRESS_QUEST_CAPACITY = 8;
/** @deprecated Item-count capacity — use minute-based capacity helpers instead. */
export const RECOVERY_QUEST_CAPACITY = 5;

/** @deprecated Replaced by MAX_CHECKLIST_MINUTES_PER_DAY — the limit is now total scheduled time, not item count. */
export const MAX_CHECKLIST_ITEMS_PER_DAY = 5;

/** Checklist items build habits, not a to-do dump — capped at 2h30 (150 min) total scheduled time per day. */
export const MAX_CHECKLIST_MINUTES_PER_DAY = 150;

/** Total minutes of scheduled checklist items on a given weekday, optionally excluding one item (used to validate an edit to that same item before saving it). */
export function computeChecklistMinutesForDay(plan: DayPlanRaw | null | undefined, day: WeekdayName, excludeId?: string): number {
  return getChecklistItemsForDay(plan, day)
    .filter((item) => item.id !== excludeId)
    .reduce((sum, item) => sum + parseDurationMinutes(item.durationMinutes ?? item.duration, 30), 0);
}

/** "Checklist time: 1h 45m / 2h 30m" style label for the Day Plan header. */
export function formatChecklistTimeLabel(plannedMinutes: number): string {
  return `Checklist time: ${formatPlannedDurationLabel(plannedMinutes)} / ${formatPlannedDurationLabel(MAX_CHECKLIST_MINUTES_PER_DAY)}`;
}

export type QuestSource = "Quest" | "Today's Quest" | "Checklist" | "Quick Thought" | "Calendar" | "Sleep";
export type QuestKind = "progress" | "recovery";

/** User-facing label for a quest source — "Quick Thought" displays as "Quest" everywhere in the UI. */
export function questSourceLabel(source: QuestSource): string {
  return source === "Quick Thought" ? "Quest" : source;
}

export type CompletionEntry = {
  id: string;
  title: string;
  steps: number;
  source: QuestSource;
  dateKey: string;
  completedAt: string;
  /** Minutes the item took — drives duration-scaled energy cost/restore on the Home flame. */
  durationMinutes?: number;
  /** Progress spends energy, recovery restores it. Missing on legacy entries — treated as "progress". */
  kind?: QuestKind;
};

export type MissedEntry = {
  id: string;
  title: string;
  dateKey: string;
  missedAt: string;
};

export type HomeQuestItem = {
  id: string;
  title: string;
  source: QuestSource;
  kind: QuestKind;
  steps: number;
  durationMinutes: number;
  scheduledTime?: string;
  description?: string;
  mandatory?: boolean;
  starter?: boolean;
  suggested?: boolean;
};

type QuestLike = {
  title: string;
  type?: string;
  steps?: number;
  description?: string;
  mandatory?: boolean;
  starter?: boolean;
  suggested?: boolean;
  durationMinutes?: number;
  kind?: QuestKind;
};

type RawChecklistItem = {
  id?: string;
  text?: string;
  title?: string;
  checked?: boolean;
  /** Date (YYYY-MM-DD) `checked` was last set true — lets the Quest Board tell "checked
   *  today" apart from "checked on some earlier day," since `checked` itself never resets. */
  checkedDate?: string;
  steps?: number;
  startTime?: string;
  time?: string;
  duration?: string;
  durationMinutes?: number;
  kind?: QuestKind;
  status?: string;
  weekdays?: WeekdayName[];
};

export type RawTodayQuest = {
  id?: string;
  title?: string;
  startTime?: string;
  duration?: string;
  durationMinutes?: number;
  steps?: number;
  kind?: QuestKind;
  status?: string;
  date?: string;
};

type QueueItem = {
  id?: string;
  text?: string;
  title?: string;
  task?: string;
  note?: string;
  type?: string;
  date?: string;
  dateKey?: string;
  time?: string;
  startTime?: string;
  duration?: string;
  durationMinutes?: number;
  steps?: number;
  status?: string;
  completedAt?: string;
  classification?: QuestKind;
  kind?: string;
};

type DayPlanRaw = {
  todayQuest?: RawTodayQuest;
  weekdayChecklists?: Partial<Record<WeekdayName, RawChecklistItem[]>>;
};

const WEEKDAYS: WeekdayName[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function getTodayKey(): string {
  return getDateKey();
}

export function getWeekdayName(date = new Date()): WeekdayName {
  return WEEKDAYS[date.getDay()];
}

export function getQuestCapacityMinutes(mode: "Progress" | "Recovery"): number {
  return mode === "Recovery" ? RECOVERY_CAPACITY_MINUTES : PROGRESS_CAPACITY_MINUTES;
}

/** @deprecated Use getQuestCapacityMinutes for time-based board limits. */
export function getQuestCapacity(mode: "Progress" | "Recovery"): number {
  return mode === "Recovery" ? RECOVERY_QUEST_CAPACITY : PROGRESS_QUEST_CAPACITY;
}

export function itemDurationMinutes(item: Pick<HomeQuestItem, "durationMinutes">): number {
  const minutes = safeNumber(item.durationMinutes, 30);
  return minutes > 0 ? minutes : 30;
}

export function formatPlannedDurationLabel(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

export function formatCapacityHeader(plannedMinutes: number, mode: "Progress" | "Recovery"): string {
  const capHours = mode === "Recovery" ? 5 : 8;
  return `Planned ${formatPlannedDurationLabel(plannedMinutes)} / ${capHours}h`;
}

/**
 * The user's explicitly saved kind/classification is the source of truth — it must win
 * outright over the title-keyword fallback. inferScheduledClassification already does this
 * correctly when given a full object, but its Partial<ScheduledQuestLike> parameter type
 * doesn't line up with every raw shape in this file (RawChecklistItem/QueueItem `status`
 * fields are plain strings), so this loosely-typed helper avoids fighting that mismatch.
 */
function resolveExplicitOrInferredKind(input: { kind?: string; classification?: string; title: string }): QuestKind {
  if (input.kind === "progress" || input.classification === "progress") return "progress";
  if (input.kind === "recovery" || input.classification === "recovery") return "recovery";
  return inferScheduledClassification(input.title) === "recovery" ? "recovery" : "progress";
}

function isActiveScheduledItem(status?: string, completedAt?: string): boolean {
  if (completedAt) return false;
  if (status === "completed" || status === "missed") return false;
  return true;
}

/** User-scheduled quest minutes for a day (Quick Thoughts + Day Plan), all kinds combined. */
export function computeUserScheduledMinutesForDay(input: {
  dateKey: string;
  weekday: WeekdayName;
  quickThoughts: QueueItem[];
  dayPlan: DayPlanRaw | null | undefined;
}): number {
  let total = 0;

  for (const raw of input.quickThoughts) {
    const itemDate = raw.date ?? raw.dateKey;
    if (itemDate !== input.dateKey) continue;
    if (!isActiveScheduledItem(raw.status, raw.completedAt)) continue;
    total += parseDurationMinutes(raw.durationMinutes ?? raw.duration, 30);
  }

  const todayQuest = input.dayPlan?.todayQuest;
  if (todayQuest?.title?.trim()) {
    const questDate = todayQuest.date ?? input.dateKey;
    if (questDate === input.dateKey) {
      if (isActiveScheduledItem(todayQuest.status)) {
        total += parseDurationMinutes(todayQuest.durationMinutes ?? todayQuest.duration, 60);
      }
    }
  }

  const checklist = getChecklistItemsForDay(input.dayPlan, input.weekday);
  for (const raw of checklist) {
    if (raw.checked || !isActiveScheduledItem(raw.status)) continue;
    total += parseDurationMinutes(raw.durationMinutes ?? raw.duration, 30);
  }

  return total;
}

/**
 * Same inputs as computeUserScheduledMinutesForDay, but split by kind (progress vs
 * recovery) using each item's EXPLICIT saved kind — never inferred from the current board
 * mode. Used to enforce the max-progress-time sub-cap alongside the total day cap.
 */
export function computeUserScheduledMinutesByKindForDay(input: {
  dateKey: string;
  weekday: WeekdayName;
  quickThoughts: QueueItem[];
  dayPlan: DayPlanRaw | null | undefined;
}): { progressMinutes: number; recoveryMinutes: number; totalMinutes: number } {
  let progressMinutes = 0;
  let recoveryMinutes = 0;
  const add = (kind: QuestKind, minutes: number) => {
    if (kind === "recovery") recoveryMinutes += minutes;
    else progressMinutes += minutes;
  };

  for (const raw of input.quickThoughts) {
    const itemDate = raw.date ?? raw.dateKey;
    if (itemDate !== input.dateKey) continue;
    if (!isActiveScheduledItem(raw.status, raw.completedAt)) continue;
    const minutes = parseDurationMinutes(raw.durationMinutes ?? raw.duration, 30);
    const title = (raw.text || raw.title || raw.task || raw.note || "").trim();
    add(resolveExplicitOrInferredKind({ kind: raw.kind, classification: raw.classification, title }), minutes);
  }

  const todayQuest = input.dayPlan?.todayQuest;
  if (todayQuest?.title?.trim()) {
    const questDate = todayQuest.date ?? input.dateKey;
    if (questDate === input.dateKey && isActiveScheduledItem(todayQuest.status)) {
      const minutes = parseDurationMinutes(todayQuest.durationMinutes ?? todayQuest.duration, 60);
      add(todayQuest.kind === "recovery" ? "recovery" : "progress", minutes);
    }
  }

  const checklist = getChecklistItemsForDay(input.dayPlan, input.weekday);
  for (const raw of checklist) {
    if (raw.checked || !isActiveScheduledItem(raw.status)) continue;
    const minutes = parseDurationMinutes(raw.durationMinutes ?? raw.duration, 30);
    const title = (raw.text || raw.title || "").trim();
    add(resolveExplicitOrInferredKind({ kind: raw.kind, title }), minutes);
  }

  return { progressMinutes, recoveryMinutes, totalMinutes: progressMinutes + recoveryMinutes };
}

export function checkUserScheduledQuestCapacity(input: {
  dateKey: string;
  weekday: WeekdayName;
  quickThoughts: QueueItem[];
  dayPlan: DayPlanRaw | null | undefined;
  additionalMinutes: number;
  /** Kind of the item being added — defaults to "progress" (the common case: quests/checklist items are progress unless explicitly marked recovery). Only progress-kind additions are checked against the max-progress-time sub-cap. */
  additionalKind?: QuestKind;
  boardMode: "Progress" | "Recovery";
}): {
  allowed: boolean;
  plannedMinutes: number;
  capacityMinutes: number;
  remainingMinutes: number;
  modeLabel: "Progress" | "Recovery";
  /** True when the total cap was satisfied but the max-progress-time sub-cap was the actual blocker. */
  blockedByProgressCap: boolean;
  progressMinutes: number;
  maxProgressMinutes: number;
} {
  const plannedMinutes = computeUserScheduledMinutesForDay(input);
  const capacityMinutes = getQuestCapacityMinutes(input.boardMode);
  const remainingMinutes = Math.max(0, capacityMinutes - plannedMinutes);
  const additionalKind = input.additionalKind ?? "progress";

  const { progressMinutes } = computeUserScheduledMinutesByKindForDay(input);
  const maxProgressMinutes = getMaxProgressMinutes(input.boardMode);
  const wouldExceedProgressCap =
    additionalKind === "progress" && progressMinutes + input.additionalMinutes > maxProgressMinutes;

  const withinTotalCap = plannedMinutes + input.additionalMinutes <= capacityMinutes;

  return {
    allowed: withinTotalCap && !wouldExceedProgressCap,
    plannedMinutes,
    capacityMinutes,
    remainingMinutes,
    modeLabel: input.boardMode,
    blockedByProgressCap: withinTotalCap && wouldExceedProgressCap,
    progressMinutes,
    maxProgressMinutes,
  };
}

const DEFAULT_TODAY_QUEST_TITLES = new Set(["choose one honest quest for today"]);

/** True when Today's Quest is still the unset placeholder (or empty) — the user hasn't set one yet. */
export function isDefaultTodayQuestTitle(title?: string | null): boolean {
  const trimmed = (title ?? "").trim().toLowerCase();
  return trimmed === "" || DEFAULT_TODAY_QUEST_TITLES.has(trimmed);
}

/**
 * Single source of truth for "is there a Today's Quest actually live for `todayKey`" — used by
 * both the Quest Board (normalizeQuestItems, below) and the home screen's "SET TODAY'S QUEST"
 * prompt, so the two can never disagree. A quest with a real title can still be inactive: its
 * completed/missed status only carries over from the SAME day (a status saved on a prior day
 * must not block a fresh quest), and it drops off after its 24h rollover window either way.
 */
export function isTodayQuestActiveForToday(
  todayQuest: RawTodayQuest | null | undefined,
  todayKey: string
): todayQuest is RawTodayQuest & { title: string } {
  if (!todayQuest?.title?.trim() || isDefaultTodayQuestTitle(todayQuest.title)) return false;
  const status = !todayQuest.date || todayQuest.date === todayKey ? todayQuest.status : undefined;
  if (status === "completed" || String(status) === "missed") return false;
  if (isScheduledItemExpired({ date: todayQuest.date, startTime: todayQuest.startTime })) return false;
  return true;
}

/**
 * True only when today's Today Quest was completed TODAY — distinct from "not active", which
 * is also true once completed. Without this, "SET TODAY'S QUEST" would reappear immediately
 * after finishing today's quest instead of waiting until the next day.
 */
export function isTodayQuestCompletedToday(todayQuest: RawTodayQuest | null | undefined, todayKey: string): boolean {
  if (!todayQuest?.title?.trim() || isDefaultTodayQuestTitle(todayQuest.title)) return false;
  const status = !todayQuest.date || todayQuest.date === todayKey ? todayQuest.status : undefined;
  return status === "completed";
}

/** Day Plan today's quest or checklist habits scheduled for today. */
export function hasUserDayPlanItems(input: {
  todayQuest?: RawTodayQuest | null;
  checklist: RawChecklistItem[];
}): boolean {
  const questTitle = input.todayQuest?.title?.trim().toLowerCase() ?? "";
  if (questTitle && !DEFAULT_TODAY_QUEST_TITLES.has(questTitle)) return true;

  return input.checklist.some((item) => (item.text || item.title || "").trim());
}

export function hasTodayQuickThoughts(input: { quickThoughts: QueueItem[]; todayKey: string }): boolean {
  return input.quickThoughts.some((item) => {
    const itemDate = item.date ?? item.dateKey ?? input.todayKey;
    if (itemDate !== input.todayKey) return false;
    if (item.status === "completed" || item.completedAt || String(item.status) === "missed") return false;
    const title = (item.text || item.title || item.task || item.note || "").trim();
    return Boolean(title);
  });
}

/** Whether the user has added Day Plan or Quick Thought items for the board. */
export function hasUserCreatedQuestItems(input: {
  todayQuest?: RawTodayQuest | null;
  checklist: RawChecklistItem[];
  quickThoughts: QueueItem[];
  todayKey: string;
}): boolean {
  return (
    hasUserDayPlanItems(input) ||
    hasTodayQuickThoughts({ quickThoughts: input.quickThoughts, todayKey: input.todayKey })
  );
}

/** Starter + mandatory + app-suggested MYLIT quests, or items the user added via Day Plan / Quick Thoughts. */
export function isQuestBoardItemAllowed(item: HomeQuestItem): boolean {
  if (item.mandatory || item.starter || item.suggested) return true;
  if (
    item.source === "Today's Quest" ||
    item.source === "Checklist" ||
    item.source === "Quick Thought" ||
    item.source === "Calendar" ||
    item.source === "Sleep"
  ) {
    return true;
  }
  return false;
}

export function filterQuestBoardItems(items: HomeQuestItem[]): HomeQuestItem[] {
  return items.filter(isQuestBoardItemAllowed);
}

type QuestPriorityTier = 0 | 1 | 2 | 3 | 4 | 5 | 6;

function getItemPriorityTier(item: HomeQuestItem): QuestPriorityTier {
  if (item.scheduledTime && parseTimeToMinutes(item.scheduledTime) !== null) return 0;
  if (item.mandatory) return 1;
  if (item.starter || item.suggested) return 2;
  if (item.source === "Today's Quest") return 3;
  if (item.source === "Checklist") return 4;
  if (item.source === "Quick Thought") return 5;
  if (item.source === "Sleep") return 5;
  return 6;
}

export function sortQuestItemsByPriority(items: HomeQuestItem[]): HomeQuestItem[] {
  return [...items].sort((a, b) => {
    const tierDiff = getItemPriorityTier(a) - getItemPriorityTier(b);
    if (tierDiff !== 0) return tierDiff;
    const aTime = parseTimeToMinutes(a.scheduledTime) ?? Number.MAX_SAFE_INTEGER;
    const bTime = parseTimeToMinutes(b.scheduledTime) ?? Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;
    return a.title.localeCompare(b.title);
  });
}

export function applyQuestBoardCapacity(
  items: HomeQuestItem[],
  mode: "Progress" | "Recovery"
): {
  visibleItems: HomeQuestItem[];
  hiddenCount: number;
  plannedMinutes: number;
  capacityMinutes: number;
} {
  const capacityMinutes = getQuestCapacityMinutes(mode);
  const sorted = sortQuestItemsByPriority(filterQuestBoardItems(items));

  const visibleItems: HomeQuestItem[] = [];
  let plannedMinutes = 0;

  for (const item of sorted) {
    const duration = itemDurationMinutes(item);
    if (visibleItems.length === 0) {
      visibleItems.push(item);
      plannedMinutes += duration;
      continue;
    }
    if (plannedMinutes + duration <= capacityMinutes) {
      visibleItems.push(item);
      plannedMinutes += duration;
    }
  }

  return {
    visibleItems,
    hiddenCount: Math.max(0, sorted.length - visibleItems.length),
    plannedMinutes,
    capacityMinutes,
  };
}

export function buildStableItemId(
  source: QuestSource,
  title: string,
  options?: { rawId?: string; dateKey?: string; scheduledTime?: string }
): string {
  if (options?.rawId) return String(options.rawId);
  const datePart = options?.dateKey ?? getTodayKey();
  const timePart = options?.scheduledTime ? `-${options.scheduledTime.replace(/\s/g, "")}` : "";
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  return `${source.toLowerCase().replace(/\s/g, "-")}-${datePart}-${slug}${timePart}`;
}

export function parseCompletions(raw: unknown, todayKey = getTodayKey()): CompletionEntry[] {
  if (!raw) return [];

  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry, index) => {
        if (typeof entry === "string") {
          const title = entry.trim();
          if (!title) return null;
          return {
            id: buildStableItemId("Quest", title, { dateKey: todayKey }),
            title,
            steps: 0,
            source: "Quest" as QuestSource,
            dateKey: todayKey,
            completedAt: new Date().toISOString(),
          };
        }

        if (!entry || typeof entry !== "object") return null;
        const record = entry as Partial<CompletionEntry>;
        const title = String(record.title ?? "").trim();
        if (!title) return null;
        return {
          id: String(record.id ?? buildStableItemId((record.source as QuestSource) || "Quest", title, { dateKey: record.dateKey ?? todayKey })),
          title,
          steps: safeNumber(record.steps, 0),
          source: (record.source as QuestSource) || "Quest",
          dateKey: String(record.dateKey ?? todayKey),
          completedAt: String(record.completedAt ?? new Date().toISOString()),
          durationMinutes: typeof record.durationMinutes === "number" ? record.durationMinutes : undefined,
          // Preserve kind so recovery completions RESTORE energy on reload instead of
          // being treated as progress (which subtracts energy) — that was the bug.
          kind: record.kind === "recovery" || record.kind === "progress" ? record.kind : undefined,
        };
      })
      .filter((entry): entry is CompletionEntry => entry !== null);
  } catch {
    return [];
  }
}

export function parseMissed(raw: unknown, todayKey = getTodayKey()): MissedEntry[] {
  if (!raw) return [];

  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const record = entry as Partial<MissedEntry>;
        const id = String(record.id ?? "").trim();
        const title = String(record.title ?? "").trim();
        if (!id && !title) return null;
        return {
          id: id || buildStableItemId("Quest", title, { dateKey: record.dateKey ?? todayKey }),
          title: title || "Missed quest",
          dateKey: String(record.dateKey ?? todayKey),
          missedAt: String(record.missedAt ?? new Date().toISOString()),
        };
      })
      .filter((entry): entry is MissedEntry => entry !== null);
  } catch {
    return [];
  }
}

export function isItemCompleted(
  item: Pick<HomeQuestItem, "id" | "title">,
  completions: CompletionEntry[],
  extras?: { todayQuest?: RawTodayQuest | null; checklistItem?: RawChecklistItem | null; queueItem?: QueueItem | null }
): boolean {
  if (completions.some((entry) => entry.id === item.id || entry.title === item.title)) return true;
  if (extras?.todayQuest && (extras.todayQuest.status === "completed" || extras.todayQuest.id === item.id)) return true;
  if (extras?.checklistItem && (extras.checklistItem.checked === true || extras.checklistItem.status === "completed")) return true;
  if (extras?.queueItem && (Boolean(extras.queueItem.completedAt) || extras.queueItem.status === "completed")) return true;
  return false;
}

export function isItemMissed(item: Pick<HomeQuestItem, "id" | "title">, missed: MissedEntry[], dateKey = getTodayKey()): boolean {
  return missed.some((entry) => entry.dateKey === dateKey && (entry.id === item.id || entry.title === item.title));
}

/** Progress items earn double steps; recovery items earn the base step reward. */
export function stepsForChecklistItem(kind: QuestKind, durationMinutes: number): number {
  return getStepsForItem(durationMinutes, kind);
}

export function getChecklistItemsForDay(plan: DayPlanRaw | null | undefined, day: WeekdayName): RawChecklistItem[] {
  const lists = plan?.weekdayChecklists;
  if (!lists) return [];

  const seen = new Map<string, RawChecklistItem>();
  for (const bucketDay of WEEKDAYS) {
    const bucketItems = lists[bucketDay];
    if (!Array.isArray(bucketItems)) continue;
    for (const raw of bucketItems) {
      const weekdays = Array.isArray(raw.weekdays) && raw.weekdays.length > 0 ? raw.weekdays : [bucketDay];
      if (!weekdays.includes(day)) continue;
      const id = raw.id ?? `${bucketDay}-${raw.text ?? raw.title ?? "item"}`;
      if (!seen.has(id)) seen.set(id, raw);
    }
  }
  return Array.from(seen.values());
}

/** "Set Pre-Sleep Intention" only appears on the Quest Board at/after this local hour. */
export const PRE_SLEEP_INTENTION_UNLOCK_HOUR = 21;
/** Matches morning-intention-reflection.tsx's MORNING_UNLOCK_HOUR — Pre-Sleep Intention's window closes when Morning Reflection's opens. */
const MORNING_REFLECTION_UNLOCK_HOUR = 7;

export function normalizeQuestItems(input: {
  quests: QuestLike[];
  todayQuest?: RawTodayQuest | null;
  checklist: RawChecklistItem[];
  quickThoughts: QueueItem[];
  calendarItems?: ScheduledQuestLike[];
  todayKey: string;
  completedIds: Set<string>;
  missedIds: Set<string>;
  /** True once today's Pre-Sleep Intention has been saved — hides the Sleep reminder for the rest of the day. */
  preSleepIntentionDoneToday?: boolean;
  /** Defaults to the real current time — overridable in tests. */
  now?: Date;
}): HomeQuestItem[] {
  const items: HomeQuestItem[] = [];
  const seenIds = new Set<string>();
  const now = input.now ?? new Date();

  const pushItem = (item: HomeQuestItem) => {
    if (!item.title.trim() || seenIds.has(item.id) || input.completedIds.has(item.id) || input.missedIds.has(item.id)) return;
    seenIds.add(item.id);
    items.push(item);
  };

  // Available from 9:00 PM through 6:59 AM — a wind-down ritual, not an all-day reminder,
  // but still usable by night owls who haven't gone to sleep by midnight (previously the
  // window silently closed at midnight since `hour >= 21` is false for hours 0–6). It never
  // restores or costs energy (it routes straight to /pre-sleep-intention instead of going
  // through the generic complete/energy flow).
  const preSleepWindowOpen = now.getHours() >= PRE_SLEEP_INTENTION_UNLOCK_HOUR || now.getHours() < MORNING_REFLECTION_UNLOCK_HOUR;
  if (!input.preSleepIntentionDoneToday && preSleepWindowOpen) {
    pushItem({
      id: buildStableItemId("Sleep", "Set Pre-Sleep Intention", { dateKey: input.todayKey }),
      title: "Set Pre-Sleep Intention",
      source: "Sleep",
      kind: "recovery",
      steps: 1,
      durationMinutes: 10,
      description: "Appears after 9 PM and helps you set your night direction. It does not change energy.",
    });
  }

  const todayQuest = input.todayQuest;
  if (isTodayQuestActiveForToday(todayQuest, input.todayKey)) {
    const durationMinutes = parseDurationMinutes(todayQuest.durationMinutes ?? todayQuest.duration, TODAY_QUEST_DURATION_MINUTES);
    // Kind comes only from the explicit toggle the user saved — never re-inferred from title text.
    const kind: QuestKind = todayQuest.kind === "recovery" ? "recovery" : "progress";
    pushItem({
      // Deliberately NOT keyed on todayQuest.id (that stays the same all day) — it's keyed on the
      // title/time instead, so setting a NEW quest after completing the old one under the same
      // day-plan slot produces a fresh id, not one still stuck in today's completedIds/missedIds.
      id: buildStableItemId("Today's Quest", todayQuest.title, { dateKey: input.todayKey, scheduledTime: todayQuest.startTime }),
      title: todayQuest.title.trim(),
      source: "Today's Quest",
      kind,
      steps: typeof todayQuest.steps === "number" ? todayQuest.steps : TODAY_QUEST_STEPS,
      durationMinutes,
      scheduledTime: todayQuest.startTime,
      description: "Your main quest from today's Day Plan.",
    });
  }

  input.checklist.forEach((raw, index) => {
    const title = (raw.text || raw.title || "").trim();
    if (!title) return;
    // Checklist habits recur every day they're scheduled for, so only TODAY's
    // checked/missed state should hide them — `checked`/`status` alone never reset, so
    // trusting them permanently was hiding recurring habits from every later day.
    if (raw.checked === true && raw.checkedDate === input.todayKey) return;
    if (String(raw.status) === "missed" && raw.checkedDate === input.todayKey) return;
    const durationMinutes = parseDurationMinutes(raw.durationMinutes ?? raw.duration, 30);
    const kind: QuestKind = resolveExplicitOrInferredKind({ kind: raw.kind, title });
    pushItem({
      id: buildStableItemId("Checklist", title, { rawId: raw.id ?? String(index), dateKey: input.todayKey, scheduledTime: raw.startTime || raw.time }),
      title,
      source: "Checklist",
      kind,
      steps: typeof raw.steps === "number" ? raw.steps : stepsForChecklistItem(kind, durationMinutes),
      durationMinutes,
      scheduledTime: raw.startTime || raw.time,
      description: "Recurring habit from your Day Plan checklist.",
    });
  });

  input.quickThoughts.forEach((raw, index) => {
    const itemDate = raw.date ?? raw.dateKey;
    if (itemDate && itemDate !== input.todayKey) return;
    if (raw.status === "completed" || raw.completedAt || String(raw.status) === "missed") return;
    const title = (raw.text || raw.title || raw.task || raw.note || "").trim();
    if (!title) return;
    // 24-hour rollover: an unresolved scheduled quest stays actionable through the day
    // after its scheduled time, then drops off the active board (still kept in the saved
    // Quests list/history — see isScheduledItemExpired for the exact window).
    if (isScheduledItemExpired({ date: itemDate, startTime: raw.time || raw.startTime })) return;
    const durationMinutes = parseDurationMinutes(raw.durationMinutes ?? raw.duration, 30);
    const kind: QuestKind = resolveExplicitOrInferredKind({ kind: raw.kind, classification: raw.classification, title });
    pushItem({
      id: buildStableItemId("Quick Thought", title, { rawId: raw.id ?? String(index), dateKey: input.todayKey, scheduledTime: raw.time || raw.startTime }),
      title,
      source: "Quick Thought",
      kind,
      steps: typeof raw.steps === "number" ? raw.steps : getStepsForItem(durationMinutes, kind),
      durationMinutes,
      scheduledTime: raw.time || raw.startTime,
      description: raw.type ? `Saved from Quests (${raw.type})` : "Saved from Quests.",
    });
  });

  (input.calendarItems ?? []).forEach((raw, index) => {
    if (raw.status === "completed" || String(raw.status) === "missed" || raw.checked) return;
    const title = String(raw.title ?? raw.text ?? raw.task ?? "").trim();
    if (!title) return;
    const itemDate = raw.date ?? raw.dateKey;
    if (itemDate && itemDate !== input.todayKey) return;
    // Same 24-hour rollover as the dedicated Quick Thought branch above — this branch
    // mirrors those items under a "Calendar" source, so it needs the same expiry guard.
    if (raw.source === "quickThought" && isScheduledItemExpired({ date: itemDate, startTime: raw.startTime || raw.time })) return;
    const durationMinutes = parseDurationMinutes(raw.durationMinutes ?? raw.duration, 30);
    const kind: QuestKind = resolveExplicitOrInferredKind({ kind: raw.kind, classification: raw.classification, title });
    const source: QuestSource = raw.source === "quickThought" ? "Quick Thought" : raw.source === "dayPlanChecklist" ? "Checklist" : raw.source === "todayQuest" ? "Today's Quest" : "Calendar";
    pushItem({
      id: buildStableItemId(source, title, { rawId: raw.id ?? String(index), dateKey: input.todayKey, scheduledTime: raw.startTime || raw.time }),
      title,
      source,
      kind,
      steps: typeof raw.steps === "number" ? raw.steps : getStepsForItem(durationMinutes, kind),
      durationMinutes,
      scheduledTime: raw.startTime || raw.time,
      description: raw.note || "Scheduled on your Calendar.",
    });
  });

  input.quests.forEach((quest) => {
    if (quest.type === "Personal" || quest.type === "Quick Thought") return;
    const kind: QuestKind =
      quest.mandatory || quest.kind === "recovery"
        ? "recovery"
        : quest.kind === "progress"
        ? "progress"
        : inferScheduledClassification(quest.title) === "recovery"
        ? "recovery"
        : "progress";
    // App quests run in 15-min increments and use the same step/energy system.
    const durationMinutes = quest.durationMinutes ?? (quest.starter || quest.suggested ? 15 : 30);
    pushItem({
      id: buildStableItemId("Quest", quest.title, { dateKey: input.todayKey }),
      title: quest.title,
      source: "Quest",
      kind,
      steps: typeof quest.steps === "number" ? quest.steps : getStepsForItem(durationMinutes, kind),
      durationMinutes,
      description: quest.description || quest.type,
      mandatory: quest.mandatory,
      starter: quest.starter,
      suggested: quest.suggested,
    });
  });

  return sortQuestItemsByPriority(items);
}

/**
 * Quick Thought / scheduled Quest items whose 24-hour rollover window has just closed
 * without being completed or missed. These use a stable id (their own saved `id`), so
 * they're safe to auto-record as missed — that keeps them out of history/logs instead of
 * silently vanishing with no trace once they age off the active Quest Board.
 */
export function collectExpiredUnresolvedQuickThoughts(input: {
  quickThoughts: QueueItem[];
  completedIds: Set<string>;
  missedIds: Set<string>;
}): { id: string; title: string }[] {
  const results: { id: string; title: string }[] = [];
  input.quickThoughts.forEach((raw, index) => {
    if (raw.status === "completed" || raw.completedAt || String(raw.status) === "missed") return;
    const title = (raw.text || raw.title || raw.task || raw.note || "").trim();
    if (!title) return;
    const itemDate = raw.date ?? raw.dateKey;
    if (!itemDate) return;
    const id = buildStableItemId("Quick Thought", title, {
      rawId: raw.id ?? String(index),
      dateKey: itemDate,
      scheduledTime: raw.time || raw.startTime,
    });
    if (input.completedIds.has(id) || input.missedIds.has(id)) return;
    if (isScheduledItemExpired({ date: itemDate, startTime: raw.time || raw.startTime })) {
      results.push({ id, title });
    }
  });
  return results;
}

export function findNextScheduledItem(items: HomeQuestItem[], activeId: string | null, nowMinutes: number): HomeQuestItem | null {
  const candidates = items.filter((item) => item.id !== activeId);
  if (candidates.length === 0) return null;

  const timed = candidates
    .filter((item) => item.scheduledTime && parseTimeToMinutes(item.scheduledTime) !== null)
    .sort((a, b) => (parseTimeToMinutes(a.scheduledTime) ?? 0) - (parseTimeToMinutes(b.scheduledTime) ?? 0));

  const upcoming = timed.find((item) => (parseTimeToMinutes(item.scheduledTime) ?? 0) >= nowMinutes);
  return upcoming ?? timed[0] ?? candidates[0] ?? null;
}

export function computeItemStepsFromSources(dayPlan: unknown, quickThoughts: unknown): number {
  let total = 0;
  const seenIds = new Set<string>();
  const plan = dayPlan as Record<string, unknown> | null;

  if (plan?.todayQuest) {
    const quest = plan.todayQuest as Record<string, unknown>;
    const id = quest.id ? String(quest.id) : null;
    if (quest.status === "completed" && id && !seenIds.has(id)) {
      seenIds.add(id);
      total += safeNumber(quest.steps, TODAY_QUEST_STEPS);
    }
  }

  if (plan?.weekdayChecklists && typeof plan.weekdayChecklists === "object") {
    for (const dayItems of Object.values(plan.weekdayChecklists as Record<string, unknown>)) {
      if (!Array.isArray(dayItems)) continue;
      for (const raw of dayItems) {
        const item = raw as Record<string, unknown>;
        const id = item.id ? String(item.id) : null;
        if (item.checked && id && !seenIds.has(id)) {
          seenIds.add(id);
          total += safeNumber(item.steps, 1);
        }
      }
    }
  }

  if (Array.isArray(quickThoughts)) {
    for (const raw of quickThoughts) {
      const item = raw as Record<string, unknown>;
      const id = item.id ? String(item.id) : null;
      if (item.completedAt && id && !seenIds.has(id)) {
        seenIds.add(id);
        total += safeNumber(item.steps, 1);
      }
    }
  }

  return total;
}

export function computeTotalEarnedSteps(input: {
  dayPlan: unknown;
  quickThoughts: unknown;
  todayCompletions: CompletionEntry[];
  userStats?: { totalSteps?: number };
}): number {
  const seen = new Set<string>();
  let total = computeItemStepsFromSources(input.dayPlan, input.quickThoughts);

  const plan = input.dayPlan as Record<string, unknown> | null;
  if (plan?.todayQuest) {
    const quest = plan.todayQuest as Record<string, unknown>;
    // Today's Quest completions are keyed by title/time (not quest.id — that id stays the same
    // all day even after the user sets a new quest), so recompute the SAME id used when the
    // completion was recorded, rather than reusing the raw stored quest.id.
    if (quest.status === "completed" && typeof quest.title === "string" && quest.title.trim()) {
      seen.add(
        buildStableItemId("Today's Quest", quest.title, {
          dateKey: getTodayKey(),
          scheduledTime: typeof quest.startTime === "string" ? quest.startTime : undefined,
        })
      );
    }
  }
  if (plan?.weekdayChecklists && typeof plan.weekdayChecklists === "object") {
    for (const dayItems of Object.values(plan.weekdayChecklists as Record<string, unknown>)) {
      if (!Array.isArray(dayItems)) continue;
      for (const raw of dayItems) {
        const item = raw as Record<string, unknown>;
        if (item.id && item.checked) seen.add(String(item.id));
      }
    }
  }
  if (Array.isArray(input.quickThoughts)) {
    for (const raw of input.quickThoughts) {
      const item = raw as Record<string, unknown>;
      if (item.id && item.completedAt) seen.add(String(item.id));
    }
  }

  for (const entry of input.todayCompletions) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    total += entry.steps;
  }

  return total + safeNumber(input.userStats?.totalSteps, 0);
}

/**
 * Total earned steps must never decrease — not across days, refreshes, sign-in/out, or
 * cloud merges. computeTotalEarnedSteps re-derives its total from live sources (Day Plan,
 * Quick Thoughts, today's completions) on every call; if any of those sources ever shrinks
 * (today's completions resetting for a new day, an item being edited/removed, etc.) the
 * freshly computed number could dip below what the user already saw.
 *
 * This ratchets a SEPARATE high-water-mark key (TOTAL_STEPS_FLOOR_KEY) up whenever the
 * fresh total exceeds it, and returns the higher of the two — never lower than what was
 * already recorded. Deliberately NOT stored back into USER_STATS_KEY.totalSteps: that field
 * is itself one of the inputs computeTotalEarnedSteps adds the live sources on top of, so
 * writing the combined total back into it would double-count those live sources on every
 * subsequent call.
 */
export async function reconcileMonotonicTotalSteps(freshTotal: number): Promise<number> {
  const raw = await AsyncStorage.getItem(TOTAL_STEPS_FLOOR_KEY);
  const storedFloor = safeNumber(raw ? JSON.parse(raw) : 0, 0);
  const nextFloor = Math.max(Math.round(freshTotal), storedFloor);
  if (nextFloor !== storedFloor) {
    await persistProgressKeys({ [TOTAL_STEPS_FLOOR_KEY]: JSON.stringify(nextFloor) });
  }
  return nextFloor;
}

/** Every SKILL_TIER_SIZE earned steps unlocks the next Skill tier. */
export const SKILL_TIER_SIZE = 100;

// Always compute fresh from earnedSteps — never trust stale storage values.
// At 0 earned steps, display must be 0. Bonuses are only awarded after crossing a real threshold.
// Shared by the Stats "Skill Progress" panel and the Home/Stats step-rank sync so both
// screens compare players using the same bonus-inclusive step total.
export function computeFreshRankBonuses(earnedSteps: number): { rankBonusPool: number; awardedThresholds: number[] } {
  let display = earnedSteps;
  const awardedThresholds: number[] = [];
  for (let i = 1; i <= 50; i++) {
    if (display >= i * SKILL_TIER_SIZE) {
      awardedThresholds.push(i);
      display += 10; // one-time +10 per skill tier unlock
    } else {
      break;
    }
  }
  return { rankBonusPool: awardedThresholds.length * 10, awardedThresholds };
}

export async function loadTodayCompletions(): Promise<CompletionEntry[]> {
  const today = getTodayKey();
  const savedDate = await AsyncStorage.getItem(TODAY_PROGRESS_DATE_KEY);
  const savedQuests = await AsyncStorage.getItem(COMPLETED_QUESTS_KEY);
  if (savedDate !== today) {
    await persistProgressKeys({
      [TODAY_PROGRESS_DATE_KEY]: today,
      [COMPLETED_QUESTS_KEY]: JSON.stringify([]),
    });
    return [];
  }
  return parseCompletions(savedQuests, today);
}

export async function saveTodayCompletions(entries: CompletionEntry[]): Promise<void> {
  const today = getTodayKey();
  await persistProgressKeys({
    [TODAY_PROGRESS_DATE_KEY]: today,
    [COMPLETED_QUESTS_KEY]: JSON.stringify(entries),
  });
}

export async function loadTodayMissed(): Promise<MissedEntry[]> {
  const today = getTodayKey();
  const raw = await AsyncStorage.getItem(MISSED_QUESTS_KEY);
  return parseMissed(raw, today).filter((entry) => entry.dateKey === today);
}

export async function saveTodayMissed(entries: MissedEntry[]): Promise<void> {
  const today = getTodayKey();
  const raw = await AsyncStorage.getItem(MISSED_QUESTS_KEY);
  const existing = parseMissed(raw).filter((entry) => entry.dateKey !== today);
  await persistProgressKeys({
    [MISSED_QUESTS_KEY]: JSON.stringify([...existing, ...entries]),
  });
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function syncSourceCompletion(item: HomeQuestItem): Promise<void> {
  if (item.source === "Today's Quest" || item.source === "Calendar") {
    const plan = await readJson<Record<string, unknown> | null>(DAY_PLAN_KEY, null);
    if (plan?.todayQuest && typeof plan.todayQuest === "object") {
      const quest = plan.todayQuest as Record<string, unknown>;
      const questTitle = String(quest.title ?? "");
      if (quest.id === item.id || questTitle === item.title) {
        plan.todayQuest = { ...quest, status: "completed", steps: item.steps };
        await persistProgressKeys({ [DAY_PLAN_KEY]: JSON.stringify(plan) });
      }
    }
    return;
  }

  if (item.source === "Checklist") {
    const plan = await readJson<Record<string, unknown> | null>(DAY_PLAN_KEY, null);
    const lists = plan?.weekdayChecklists;
    if (!plan || !lists || typeof lists !== "object") return;
    let changed = false;
    const nextLists = { ...(lists as Record<string, RawChecklistItem[]>) };
    for (const day of WEEKDAYS) {
      const bucket = nextLists[day];
      if (!Array.isArray(bucket)) continue;
      nextLists[day] = bucket.map((entry) => {
        const title = (entry.text || entry.title || "").trim();
        if (entry.id === item.id || title === item.title) {
          changed = true;
          return { ...entry, checked: true, status: "completed" };
        }
        return entry;
      });
    }
    if (changed) {
      await persistProgressKeys({
        [DAY_PLAN_KEY]: JSON.stringify({ ...plan, weekdayChecklists: nextLists }),
      });
    }
    return;
  }

  if (item.source === "Quick Thought") {
    const queue = await readJson<QueueItem[]>(TOMORROW_QUEUE_KEY, []);
    if (!Array.isArray(queue)) return;
    const next = queue.map((entry) => {
      const title = (entry.text || entry.title || entry.task || entry.note || "").trim();
      if (entry.id === item.id || title === item.title) {
        return { ...entry, completedAt: new Date().toISOString(), status: "completed" };
      }
      return entry;
    });
    await persistProgressKeys({ [TOMORROW_QUEUE_KEY]: JSON.stringify(next) });
  }
}

async function syncSourceMissed(item: HomeQuestItem): Promise<void> {
  if (item.source === "Today's Quest" || item.source === "Calendar") {
    const plan = await readJson<Record<string, unknown> | null>(DAY_PLAN_KEY, null);
    if (plan?.todayQuest && typeof plan.todayQuest === "object") {
      const quest = plan.todayQuest as Record<string, unknown>;
      const questTitle = String(quest.title ?? "");
      if (quest.id === item.id || questTitle === item.title) {
        plan.todayQuest = { ...quest, status: "missed" };
        await persistProgressKeys({ [DAY_PLAN_KEY]: JSON.stringify(plan) });
      }
    }
  }

  if (item.source === "Checklist") {
    const plan = await readJson<Record<string, unknown> | null>(DAY_PLAN_KEY, null);
    const lists = plan?.weekdayChecklists;
    if (!plan || !lists || typeof lists !== "object") return;
    let changed = false;
    const nextLists = { ...(lists as Record<string, RawChecklistItem[]>) };
    for (const day of WEEKDAYS) {
      const bucket = nextLists[day];
      if (!Array.isArray(bucket)) continue;
      nextLists[day] = bucket.map((entry) => {
        const title = (entry.text || entry.title || "").trim();
        if (entry.id === item.id || title === item.title) {
          changed = true;
          return { ...entry, status: "missed" };
        }
        return entry;
      });
    }
    if (changed) {
      await persistProgressKeys({
        [DAY_PLAN_KEY]: JSON.stringify({ ...plan, weekdayChecklists: nextLists }),
      });
    }
  }

  if (item.source === "Quick Thought") {
    const queue = await readJson<QueueItem[]>(TOMORROW_QUEUE_KEY, []);
    if (!Array.isArray(queue)) return;
    const next = queue.map((entry) => {
      const title = (entry.text || entry.title || entry.task || entry.note || "").trim();
      if (entry.id === item.id || title === item.title) {
        return { ...entry, status: "missed" };
      }
      return entry;
    });
    await persistProgressKeys({ [TOMORROW_QUEUE_KEY]: JSON.stringify(next) });
  }
}

export async function markItemComplete(item: HomeQuestItem, existing: CompletionEntry[]): Promise<CompletionEntry[]> {
  if (existing.some((entry) => entry.id === item.id)) return existing;

  const completedAt = new Date().toISOString();
  const entry: CompletionEntry = {
    id: item.id,
    title: item.title,
    steps: item.steps,
    source: item.source,
    dateKey: getTodayKey(),
    completedAt,
    durationMinutes: item.durationMinutes,
    kind: item.kind,
  };

  await syncSourceCompletion(item);
  const next = [...existing, entry];
  await saveTodayCompletions(next);
  await appendFocusBlockLogEntry({
    id: item.id,
    title: item.title,
    kind: item.kind,
    durationMinutes: item.durationMinutes,
    scheduledStart: item.scheduledTime,
    completedAt,
    source: item.source,
  });
  return next;
}

/** One completed item, used to derive Forced Recovery from real completed work (never from a schedule). */
export type FocusBlockLogEntry = {
  id: string;
  title: string;
  kind: QuestKind;
  durationMinutes: number;
  scheduledStart?: string;
  completedAt: string;
  source: QuestSource;
  dateKey: string;
};

export async function loadFocusBlockLog(): Promise<FocusBlockLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(FOCUS_BLOCK_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FocusBlockLogEntry[]) : [];
  } catch {
    return [];
  }
}

async function appendFocusBlockLogEntry(entry: Omit<FocusBlockLogEntry, "dateKey"> & { dateKey?: string }): Promise<void> {
  const existing = await loadFocusBlockLog();
  if (existing.some((e) => e.id === entry.id)) return;
  const next = [...existing, { ...entry, dateKey: entry.dateKey ?? getTodayKey() }];
  await persistProgressKeys({ [FOCUS_BLOCK_HISTORY_KEY]: JSON.stringify(next) });
}

/** A gap this small between two completions is treated as "tapping complete", not a real break. */
const FOCUS_STREAK_GRACE_MS = 10 * 60 * 1000;
/** Minutes of contiguous completed Progress work that trigger Forced Recovery. */
const FOCUS_STREAK_TARGET_MINUTES = 120;

export type ForcedRecoveryTrigger = {
  /** Stable across renders/refreshes — the same 2-hour block always produces the same id. */
  id: string;
  startAtMs: number;
  endsAtMs: number;
};

/**
 * Derives Luna's Forced Recovery purely from COMPLETED Progress work today (never from
 * scheduled/planned items, and never at quest-creation time). Walks the day's focus log in
 * completion order, summing contiguous Progress durations (inferring each item's start as
 * completedAt - duration) and resetting the streak whenever a Recovery-kind item (including
 * Forced Recovery itself) completes. The first moment the streak reaches 120 minutes is the
 * trigger.
 *
 * `entry.kind` is the item's EXPLICIT saved mode/kind (checklist/quest/Today's Quest all
 * write their own toggle here via markItemComplete → HomeQuestItem.kind) — it is never
 * re-inferred from the app's current Progress/Recovery mode. Two invariants this depends on:
 *   - Recovery items do not contribute to progress streaks (any duration resets it to 0).
 *   - Mixed Progress + Recovery does not trigger forced recovery — only 2 full contiguous
 *     hours of Progress-kind completions do (e.g. 1h Progress + 1h Recovery, or 1h Recovery
 *     + 1h Progress, both max out at a 60-minute streak, never reaching the 120-min target).
 */
export function getForcedRecoveryTrigger(log: FocusBlockLogEntry[], todayKey = getTodayKey()): ForcedRecoveryTrigger | null {
  const dayEntries = log
    .filter((entry) => entry.dateKey === todayKey)
    .slice()
    .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());

  let streakMinutes = 0;
  let cursorEndMs: number | null = null;

  for (const entry of dayEntries) {
    const completedAtMs = new Date(entry.completedAt).getTime();
    if (!Number.isFinite(completedAtMs)) continue;

    // Recovery items do not contribute to progress streaks — reset unconditionally.
    if (entry.kind === "recovery" || entry.title === FORCED_RECOVERY_TITLE) {
      streakMinutes = 0;
      cursorEndMs = completedAtMs;
      continue;
    }

    const durationMinutes = Math.max(0, entry.durationMinutes || 0);
    const inferredStartMs = completedAtMs - durationMinutes * 60 * 1000;

    if (cursorEndMs === null || inferredStartMs > cursorEndMs + FOCUS_STREAK_GRACE_MS) {
      streakMinutes = durationMinutes;
    } else {
      streakMinutes += durationMinutes;
    }
    cursorEndMs = completedAtMs;

    if (streakMinutes >= FOCUS_STREAK_TARGET_MINUTES) {
      return {
        id: `forced-recovery-${entry.id}`,
        startAtMs: completedAtMs,
        endsAtMs: completedAtMs + FORCED_RECOVERY_DURATION_MINUTES * 60 * 1000,
      };
    }
  }

  return null;
}

/** A HomeQuestItem-shaped stand-in used only to run Forced Recovery through the existing markItemComplete/energy pipeline. */
export function buildForcedRecoveryItem(trigger: ForcedRecoveryTrigger): HomeQuestItem {
  return {
    id: trigger.id,
    title: FORCED_RECOVERY_TITLE,
    source: "Quest",
    kind: "recovery",
    steps: 0,
    durationMinutes: FORCED_RECOVERY_DURATION_MINUTES,
    description: FORCED_RECOVERY_MESSAGE,
  };
}

export async function markItemMissed(
  item: HomeQuestItem,
  existingMissed: MissedEntry[],
  activeTimedId?: string | null
): Promise<MissedEntry[]> {
  if (existingMissed.some((entry) => entry.id === item.id)) return existingMissed;

  const entry: MissedEntry = {
    id: item.id,
    title: item.title,
    dateKey: getTodayKey(),
    missedAt: new Date().toISOString(),
  };

  await syncSourceMissed(item);
  if (activeTimedId && activeTimedId === item.id) {
    // Clears cloud too — otherwise a resolved timer could be "resurrected" by the next sign-in merge.
    await clearProgressKey(ACTIVE_TIMED_ITEM_KEY);
  }

  const next = [...existingMissed, entry];
  await saveTodayMissed(next);
  return next;
}

export function collectTodayCalendarItems(dayPlan: unknown, quickThoughts: unknown[], todayKey = getTodayKey()): ScheduledQuestLike[] {
  const resolveDateForWeekday = (weekday: WeekdayName) => {
    const today = new Date(`${todayKey}T12:00:00`);
    const dayIndex = WEEKDAYS.indexOf(weekday);
    const offset = dayIndex - today.getDay();
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    return getDateKey(date);
  };

  const checklist = collectDayPlanScheduledItems(dayPlan, resolveDateForWeekday).filter((item) => item.date === todayKey);
  const quick = collectQuickThoughtScheduledItems(quickThoughts).filter((item) => item.date === todayKey);
  const seen = new Set<string>();
  return [...quick, ...checklist].filter((item) => {
    const key = String(item.id ?? item.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sourceIcon(source: QuestSource): string {
  if (source === "Today's Quest") return "⭐";
  if (source === "Checklist") return "📋";
  if (source === "Quick Thought") return "⏱️";
  if (source === "Calendar") return "📅";
  if (source === "Sleep") return "🌙";
  return "📜";
}

export function kindAccent(kind: QuestKind): string {
  return kind === "recovery" ? "#C4A7FF" : "#84CC16";
}

export function formatDurationLabelSafe(durationMinutes: number): string {
  return formatDurationLabel(durationMinutes);
}
