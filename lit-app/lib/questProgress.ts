import AsyncStorage from "@react-native-async-storage/async-storage";

import { persistProgressKeys } from "./progressStore";
import {
  collectDayPlanScheduledItems,
  collectQuickThoughtScheduledItems,
  formatDurationLabel,
  getDateKey,
  getStepsForDuration,
  inferScheduledClassification,
  parseDurationMinutes,
  parseTimeToMinutes,
  type ScheduledQuestLike,
  type WeekdayName,
} from "./scheduling";

export const COMPLETED_QUESTS_KEY = "lit_completed_quests";
export const TODAY_PROGRESS_DATE_KEY = "lit_today_progress_date";
export const MISSED_QUESTS_KEY = "mylit_missed_quests";
export const ACTIVE_TIMED_ITEM_KEY = "mylit_active_timed_item";
export const DAY_PLAN_KEY = "lit_day_plan";
export const TOMORROW_QUEUE_KEY = "lit_tomorrow_queue";
export const USER_STATS_KEY = "lit_user_stats";

/** Progress mode allows up to 8 planned hours; Recovery mode allows up to 5. */
export const PROGRESS_CAPACITY_MINUTES = 8 * 60;
export const RECOVERY_CAPACITY_MINUTES = 5 * 60;

/** @deprecated Item-count capacity — use minute-based capacity helpers instead. */
export const PROGRESS_QUEST_CAPACITY = 8;
/** @deprecated Item-count capacity — use minute-based capacity helpers instead. */
export const RECOVERY_QUEST_CAPACITY = 5;

/** Checklist items build habits, not a to-do dump — capped at 5 scheduled for any one day. */
export const MAX_CHECKLIST_ITEMS_PER_DAY = 5;

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
};

type RawChecklistItem = {
  id?: string;
  text?: string;
  title?: string;
  checked?: boolean;
  steps?: number;
  startTime?: string;
  time?: string;
  duration?: string;
  durationMinutes?: number;
  kind?: QuestKind;
  status?: string;
  weekdays?: WeekdayName[];
};

type RawTodayQuest = {
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

function scheduledItemKind(value: {
  kind?: QuestKind | string;
  classification?: string;
  title?: string;
  text?: string;
}): QuestKind {
  if (value.kind === "recovery" || value.classification === "recovery") return "recovery";
  const title = value.title || value.text || "";
  if (inferScheduledClassification(title) === "recovery") return "recovery";
  return "progress";
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

export function checkUserScheduledQuestCapacity(input: {
  dateKey: string;
  weekday: WeekdayName;
  quickThoughts: QueueItem[];
  dayPlan: DayPlanRaw | null | undefined;
  additionalMinutes: number;
  boardMode: "Progress" | "Recovery";
}): { allowed: boolean; plannedMinutes: number; capacityMinutes: number; remainingMinutes: number; modeLabel: "Progress" | "Recovery" } {
  const plannedMinutes = computeUserScheduledMinutesForDay(input);
  const capacityMinutes = getQuestCapacityMinutes(input.boardMode);
  const remainingMinutes = Math.max(0, capacityMinutes - plannedMinutes);
  return {
    allowed: plannedMinutes + input.additionalMinutes <= capacityMinutes,
    plannedMinutes,
    capacityMinutes,
    remainingMinutes,
    modeLabel: input.boardMode,
  };
}

const DEFAULT_TODAY_QUEST_TITLES = new Set(["choose one honest quest for today"]);

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

/** Steps depend only on duration now — Progress and Recovery checklist items earn the same. */
export function stepsForChecklistItem(kind: QuestKind, durationMinutes: number): number {
  void kind;
  return getStepsForDuration(durationMinutes);
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
}): HomeQuestItem[] {
  const items: HomeQuestItem[] = [];
  const seenIds = new Set<string>();

  const pushItem = (item: HomeQuestItem) => {
    if (!item.title.trim() || seenIds.has(item.id) || input.completedIds.has(item.id) || input.missedIds.has(item.id)) return;
    seenIds.add(item.id);
    items.push(item);
  };

  if (!input.preSleepIntentionDoneToday) {
    pushItem({
      id: buildStableItemId("Sleep", "Set Pre-Sleep Intention", { dateKey: input.todayKey }),
      title: "Set Pre-Sleep Intention",
      source: "Sleep",
      kind: "recovery",
      steps: 1,
      durationMinutes: 10,
      description: "Wind down and set tonight's intention before bed.",
    });
  }

  const todayQuest = input.todayQuest;
  if (todayQuest?.title?.trim() && todayQuest.status !== "completed" && String(todayQuest.status) !== "missed") {
    const durationMinutes = parseDurationMinutes(todayQuest.durationMinutes ?? todayQuest.duration, 60);
    const kind: QuestKind =
      todayQuest.kind === "recovery" ? "recovery" : inferScheduledClassification(todayQuest.title) === "recovery" ? "recovery" : "progress";
    pushItem({
      id: buildStableItemId("Today's Quest", todayQuest.title, { rawId: todayQuest.id, dateKey: input.todayKey, scheduledTime: todayQuest.startTime }),
      title: todayQuest.title.trim(),
      source: "Today's Quest",
      kind,
      steps: typeof todayQuest.steps === "number" ? todayQuest.steps : getStepsForDuration(durationMinutes),
      durationMinutes,
      scheduledTime: todayQuest.startTime,
      description: "Your main quest from today's Day Plan.",
    });
  }

  input.checklist.forEach((raw, index) => {
    const title = (raw.text || raw.title || "").trim();
    if (!title || raw.checked === true || raw.status === "completed" || String(raw.status) === "missed") return;
    const durationMinutes = parseDurationMinutes(raw.durationMinutes ?? raw.duration, 30);
    const kind: QuestKind =
      raw.kind === "recovery" ? "recovery" : inferScheduledClassification(title) === "recovery" ? "recovery" : "progress";
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
    const durationMinutes = parseDurationMinutes(raw.durationMinutes ?? raw.duration, 30);
    const kind: QuestKind =
      raw.classification === "recovery" ? "recovery" : inferScheduledClassification(title) === "recovery" ? "recovery" : "progress";
    pushItem({
      id: buildStableItemId("Quick Thought", title, { rawId: raw.id ?? String(index), dateKey: input.todayKey, scheduledTime: raw.time || raw.startTime }),
      title,
      source: "Quick Thought",
      kind,
      steps: typeof raw.steps === "number" ? raw.steps : getStepsForDuration(durationMinutes),
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
    const durationMinutes = parseDurationMinutes(raw.durationMinutes ?? raw.duration, 30);
    const kind: QuestKind =
      raw.kind === "recovery" || raw.classification === "recovery"
        ? "recovery"
        : inferScheduledClassification(title) === "recovery"
        ? "recovery"
        : "progress";
    const source: QuestSource = raw.source === "quickThought" ? "Quick Thought" : raw.source === "dayPlanChecklist" ? "Checklist" : raw.source === "todayQuest" ? "Today's Quest" : "Calendar";
    pushItem({
      id: buildStableItemId(source, title, { rawId: raw.id ?? String(index), dateKey: input.todayKey, scheduledTime: raw.startTime || raw.time }),
      title,
      source,
      kind,
      steps: typeof raw.steps === "number" ? raw.steps : getStepsForDuration(durationMinutes),
      durationMinutes,
      scheduledTime: raw.startTime || raw.time,
      description: raw.note || "Scheduled on your Calendar.",
    });
  });

  input.quests.forEach((quest) => {
    if (quest.type === "Personal" || quest.type === "Quick Thought") return;
    const kind: QuestKind = quest.mandatory ? "recovery" : inferScheduledClassification(quest.title) === "recovery" ? "recovery" : "progress";
    pushItem({
      id: buildStableItemId("Quest", quest.title, { dateKey: input.todayKey }),
      title: quest.title,
      source: "Quest",
      kind,
      steps: quest.steps ?? 1,
      durationMinutes: quest.durationMinutes ?? (quest.starter || quest.suggested ? 10 : 30),
      description: quest.description || quest.type,
      mandatory: quest.mandatory,
      starter: quest.starter,
      suggested: quest.suggested,
    });
  });

  return sortQuestItemsByPriority(items);
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
      total += safeNumber(quest.steps, 2);
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
    if (quest.id) seen.add(String(quest.id));
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

  const entry: CompletionEntry = {
    id: item.id,
    title: item.title,
    steps: item.steps,
    source: item.source,
    dateKey: getTodayKey(),
    completedAt: new Date().toISOString(),
  };

  await syncSourceCompletion(item);
  const next = [...existing, entry];
  await saveTodayCompletions(next);
  return next;
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
    await AsyncStorage.removeItem(ACTIVE_TIMED_ITEM_KEY);
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
