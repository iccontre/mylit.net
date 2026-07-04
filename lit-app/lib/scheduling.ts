export type ScheduledKind = "progress" | "recovery" | "sleepGuide" | "focus" | "todayQuest" | "quickThought" | "checklist";
export type ScheduledClassification = "progress" | "recovery" | "sleepGuide" | "focus";

export type ScheduledStatus =
  | "scheduled"
  | "active"
  | "completed"
  | "expired"
  | "needsReflection"
  | "recoveryRequired";

export type ScheduledSource =
  | "quickThought"
  | "dayPlanChecklist"
  | "todayFocus"
  | "todayQuest"
  | "questBoard"
  | "sleepCalendar"
  | "recoveryBlock"
  | string;

export type ScheduledQuestLike = {
  id: string;
  source?: ScheduledSource;
  title?: string;
  text?: string;
  task?: string;
  note?: string;
  type?: string;
  classification?: ScheduledClassification;
  date?: string;
  dateKey?: string;
  weekday?: string;
  time?: string;
  startTime?: string;
  duration?: string;
  durationMinutes?: number;
  steps?: number;
  status?: ScheduledStatus;
  kind?: ScheduledKind;
  checked?: boolean;
  completedAt?: string;
  createdAt?: string;
  isMandatoryRecovery?: boolean;
};

export type WeekdayName =
  | "Sunday"
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday";

const WEEKDAYS: WeekdayName[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const RECOVERY_WORDS = ["eat", "meal", "food", "snack", "relax", "rest", "nap", "sleep", "social", "socialize", "breathe", "breathing", "journal", "walk", "shower", "recover", "recovery", "break", "stretch", "reset"];

export function getDateKey(date: Date | string = new Date()): string {
  if (typeof date === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    const parsed = new Date(date);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleDateString("en-CA");
    return date;
  }

  return date.toLocaleDateString("en-CA");
}

export function generateTimeSlots(startHour = 7, endHour = 22, stepMinutes = 30): string[] {
  const slots: string[] = [];
  for (let minutes = startHour * 60; minutes <= endHour * 60; minutes += stepMinutes) {
    slots.push(formatMinutesAsTime(minutes));
  }
  return slots;
}

export function parseDurationMinutes(value?: string | number | null, fallbackMinutes = 30): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value) return fallbackMinutes;

  const normalized = String(value).trim().toLowerCase();
  if (normalized.includes("1 hr") || normalized.includes("1 hour")) return 60;

  const minuteMatch = normalized.match(/(\d+)\s*(min|mins|minute|minutes)/);
  if (minuteMatch?.[1]) return Number(minuteMatch[1]);

  const hourMatch = normalized.match(/(\d+)\s*(hr|hrs|hour|hours)/);
  if (hourMatch?.[1]) return Number(hourMatch[1]) * 60;

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : fallbackMinutes;
}

export function formatDurationLabel(value?: string | number | null, fallbackMinutes = 30): string {
  const minutes = parseDurationMinutes(value, fallbackMinutes);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) return hours === 1 ? "1 hr" : `${hours} hrs`;
  return `${hours} hr ${remainingMinutes} min`;
}

/**
 * BASE step unit per duration: 15 min → 1, 30 min → 2, 45 min → 3, 1 hr → 4
 * (+1 per extra 15 min). This is also the scale the energy formulas below build on,
 * so it must stay fixed — kind-aware step rewards come from getStepsForItem.
 */
export function getStepsForDuration(duration?: string | number | null): number {
  const minutes = parseDurationMinutes(duration, 30);
  return Math.max(1, Math.round(minutes / 15));
}

/** A 2-hour duration is only offered for Today's Quest — it's worth a flat +20 steps. */
export const TODAY_QUEST_TWO_HOUR_MINUTES = 120;
export const TODAY_QUEST_TWO_HOUR_STEPS = 20;
/** A completed 2-hour Progress Today's Quest costs a flat -12 energy (not the generic duration formula). */
export const TODAY_QUEST_TWO_HOUR_ENERGY_COST = 12;

/**
 * Step reward for a quest/checklist item, by duration AND kind:
 * Progress → 15 min = +2, 30 = +4, 45 = +6, 1 hr = +8 (double the base).
 * Recovery → 15 min = +1, 30 = +2, 45 = +3, 1 hr = +4 (base).
 * 2 hr (Today's Quest only) → flat +20, regardless of kind.
 * Energy costs/restores are unchanged (they use getStepsForDuration directly).
 */
export function getStepsForItem(
  duration?: string | number | null,
  kind?: "progress" | "recovery" | string | null
): number {
  const minutes = parseDurationMinutes(duration, 30);
  if (minutes >= TODAY_QUEST_TWO_HOUR_MINUTES) return TODAY_QUEST_TWO_HOUR_STEPS;
  const base = getStepsForDuration(minutes);
  return kind === "recovery" ? base : base * 2;
}

/** @deprecated Prefer getStepsForItem(duration, kind). Defaults to the progress reward. */
export function getQuickThoughtSteps(duration?: string | number | null): number {
  return getStepsForItem(duration, "progress");
}

/**
 * Energy a completed PROGRESS quest/checklist item costs, scaled by its duration:
 * 15 min → 1, 30 min → 3, 45 min → 5, 1 hr → 7 (+2 per extra 15 min beyond).
 * Recovery/nap items never cost energy — they restore it.
 */
export function getEnergyCostForDuration(duration?: string | number | null): number {
  return Math.max(1, getStepsForDuration(duration) * 2 - 1);
}

/**
 * Energy a completed RECOVERY quest/checklist item restores, scaled by its duration:
 * 15 min → +2, 30 min → +4, 45 min → +6, 1 hr → +8 (+2 per extra 15 min beyond).
 */
export function getEnergyRestoreForDuration(duration?: string | number | null): number {
  return Math.max(2, getStepsForDuration(duration) * 2);
}

/** Energy a completed NAP quest restores: 30 min → +5, 1 hr → +10 (scales at ~1 per 6 min). */
export function getNapEnergyRestore(duration?: string | number | null): number {
  const minutes = parseDurationMinutes(duration, 30);
  return Math.max(5, Math.round(minutes / 6));
}

/** Energy the mandatory eat/rest quest restores when completed. */
export const MANDATORY_QUEST_RESTORE_ENERGY = 5;

/** A nap quest's title always begins with "Nap" so completions can be identified from logs. */
export function isNapTitle(title?: string | null): boolean {
  return /(^|\b)nap\b/i.test(String(title ?? ""));
}

/** Luna's completed-focus-block lock — title is stable so completions can be identified from logs. */
export const FORCED_RECOVERY_TITLE = "Forced Recovery";
export const FORCED_RECOVERY_DURATION_MINUTES = 60;
/** Completing Forced Recovery restores +10 energy exactly once. */
export const FORCED_RECOVERY_RESTORE_ENERGY = 10;
export const FORCED_RECOVERY_MESSAGE =
  "Luna noticed you completed a 2-hour focus block. Take 1 hour to recover and protect your flame.";

/**
 * Signed energy change applied when an item is COMPLETED (never on save):
 * mandatory → +5, nap → +5/+10, Forced Recovery → +10, recovery → +2/+4/+6/+8,
 * progress → -1/-3/-5/-7, 2 hr Progress Today's Quest → flat -12.
 */
export function getEnergyDelta(opts: {
  kind?: ScheduledClassification | "progress" | "recovery" | string | null;
  durationMinutes?: string | number | null;
  title?: string | null;
  mandatory?: boolean;
}): number {
  if (opts.mandatory) return MANDATORY_QUEST_RESTORE_ENERGY;
  if (opts.title === FORCED_RECOVERY_TITLE) return FORCED_RECOVERY_RESTORE_ENERGY;
  if (isNapTitle(opts.title)) return getNapEnergyRestore(opts.durationMinutes);
  const minutes = parseDurationMinutes(opts.durationMinutes, 30);
  if (opts.kind !== "recovery" && minutes >= TODAY_QUEST_TWO_HOUR_MINUTES) return -TODAY_QUEST_TWO_HOUR_ENERGY_COST;
  if (opts.kind === "recovery") return getEnergyRestoreForDuration(minutes);
  return -getEnergyCostForDuration(minutes);
}

/** Concise, readable energy label, e.g. "Energy: +4" or "Energy: -3". */
export function formatEnergyDelta(delta: number): string {
  return `Energy: ${delta > 0 ? "+" : ""}${delta}`;
}

/** Today's Quest is a fixed 1-hour slot worth a flat +5 steps — not part of the 15/30/45/60 picker. */
export const TODAY_QUEST_DURATION_MINUTES = 60;
export const TODAY_QUEST_DURATION_LABEL = "1 hr";
export const TODAY_QUEST_STEPS = 10;

export function inferScheduledClassification(item: Partial<ScheduledQuestLike> | string | null | undefined): ScheduledClassification {
  if (typeof item !== "string") {
    if (item?.classification === "sleepGuide" || item?.kind === "sleepGuide") return "sleepGuide";
    if (item?.classification === "focus" || item?.kind === "focus") return "focus";
    if (item?.classification === "progress" || item?.kind === "progress") return "progress";
    if (item?.classification === "recovery" || item?.kind === "recovery") return "recovery";
  }

  const text = typeof item === "string" ? item : String(item?.title ?? item?.text ?? item?.task ?? "");
  const lower = text.toLowerCase();
  return RECOVERY_WORDS.some((word) => lower.includes(word)) ? "recovery" : "progress";
}

export function inferScheduledKind(item: Partial<ScheduledQuestLike> | string | null | undefined): ScheduledKind {
  if (typeof item !== "string" && item?.kind) return item.kind;
  return inferScheduledClassification(item) === "recovery" ? "recovery" : "progress";
}

function getItemTitle(item: Partial<ScheduledQuestLike> | Record<string, unknown>): string {
  return String(item?.title ?? item?.text ?? item?.task ?? item?.note ?? "Scheduled item");
}

function getItemStartTime(item: Partial<ScheduledQuestLike>): string | undefined {
  return item.startTime ?? item.time;
}

function getItemDate(item: Partial<ScheduledQuestLike>): string | undefined {
  return item.date ?? item.dateKey;
}

export function parseTimeToMinutes(time?: string | null): number | null {
  if (!time) return null;
  const normalized = String(time).trim().toUpperCase();
  const match12 = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (match12) {
    let hour = Number(match12[1]);
    const minute = Number(match12[2] ?? "0");
    const meridiem = match12[3];
    if (meridiem === "PM" && hour !== 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
    return hour * 60 + minute;
  }

  const match24 = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) return Number(match24[1]) * 60 + Number(match24[2]);
  return null;
}

/** Parses a single time or sleep-guide range like "7:00 PM – 8:00 PM" (uses the first time for placement). */
export function parseSleepGuideTime(value?: string | null): number | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  const rangeMatch = trimmed.match(/^(.+?)\s*[–—-]\s*(.+)$/);
  if (rangeMatch) {
    const start = parseTimeToMinutes(rangeMatch[1].trim());
    if (start !== null) return start;
  }
  return parseTimeToMinutes(trimmed);
}

export function formatMinutesAsTime(minutes: number): string {
  const safe = ((minutes % 1440) + 1440) % 1440;
  const hour24 = Math.floor(safe / 60);
  const minute = safe % 60;
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

export function shiftTimeSlot(time: string, direction: -1 | 1, slots = generateTimeSlots()): string {
  const index = slots.indexOf(time);
  if (index === -1) return slots[0] ?? time;
  const nextIndex = Math.min(Math.max(index + direction, 0), slots.length - 1);
  return slots[nextIndex] ?? time;
}

function getRange(item: Partial<ScheduledQuestLike>) {
  const start = parseTimeToMinutes(getItemStartTime(item));
  if (start === null) return null;
  const duration = parseDurationMinutes(item.durationMinutes ?? item.duration, 30);
  return { start, end: start + duration, duration };
}

function sameScheduledDay(a: Partial<ScheduledQuestLike>, b: Partial<ScheduledQuestLike>): boolean {
  const aDate = getItemDate(a);
  const bDate = getItemDate(b);
  if (aDate && bDate) return aDate === bDate;
  if (a.weekday && b.weekday) return String(a.weekday).toLowerCase() === String(b.weekday).toLowerCase();
  return false;
}

export function findScheduleOverlap(candidate: Partial<ScheduledQuestLike>, existingItems: Partial<ScheduledQuestLike>[], ignoreId?: string): Partial<ScheduledQuestLike> | null {
  const candidateRange = getRange(candidate);
  if (!candidateRange) return null;

  for (const item of existingItems) {
    if (!item) continue;
    if (ignoreId && item.id === ignoreId) continue;
    if (candidate.id && item.id === candidate.id) continue;
    if (!sameScheduledDay(candidate, item)) continue;
    const itemRange = getRange(item);
    if (!itemRange) continue;
    if (candidateRange.start < itemRange.end && itemRange.start < candidateRange.end) return item;
  }

  return null;
}

/**
 * After 120 minutes of *contiguous* (back-to-back, no gap) scheduled items on
 * a day — mixing progress and recovery items alike — MYLIT auto-inserts a
 * 1-hour recovery block right after. A gap between items, or an existing
 * recovery item of 60+ minutes, resets the streak (the user already took a
 * real break).
 */
export function getRequiredRecoveryBlockForDate(items: Partial<ScheduledQuestLike>[], date: string): ScheduledQuestLike | null {
  const dayItems = items
    .filter((item) => getItemDate(item) === date)
    .filter((item) => item.status !== "expired" && item.status !== "needsReflection")
    .map((item) => ({ item, range: getRange(item) }))
    .filter((entry): entry is { item: Partial<ScheduledQuestLike>; range: { start: number; end: number; duration: number } } => entry.range !== null)
    .sort((a, b) => a.range.start - b.range.start);

  let cursor: number | null = null;
  let streakMinutes = 0;

  for (const { item, range } of dayItems) {
    const isNaturalBreak = inferScheduledClassification(item) === "recovery" && range.duration >= 60;

    if (isNaturalBreak) {
      cursor = range.end;
      streakMinutes = 0;
      continue;
    }

    if (cursor === null || range.start > cursor) {
      streakMinutes = range.duration;
    } else {
      streakMinutes += Math.max(0, range.end - cursor);
    }
    cursor = Math.max(cursor ?? range.start, range.end);

    if (streakMinutes >= 120) {
      const requiredStart = cursor;
      const startTime = formatMinutesAsTime(requiredStart);
      return {
        id: `required-recovery-${date}-${requiredStart}`,
        source: "recoveryBlock",
        title: "Required Recovery",
        date,
        startTime,
        time: startTime,
        duration: "1 hr",
        durationMinutes: 60,
        steps: 0,
        status: "recoveryRequired",
        kind: "recovery",
        classification: "recovery",
        isMandatoryRecovery: true,
      };
    }
  }

  return null;
}

/**
 * Whether adding `candidate` to a day's schedule is what pushes a contiguous
 * streak from under 2 hours to 2+ hours — i.e. whether this specific item is
 * the one that would trigger the mandatory recovery lock. Used by creation
 * flows to warn before saving.
 */
export function wouldTriggerRecoveryLock(
  candidate: Partial<ScheduledQuestLike>,
  existingItemsForDate: Partial<ScheduledQuestLike>[],
  date: string
): boolean {
  const before = getRequiredRecoveryBlockForDate(existingItemsForDate, date);
  const after = getRequiredRecoveryBlockForDate([...existingItemsForDate, candidate], date);
  if (!after) return false;
  if (!before) return true;
  return after.startTime !== before.startTime;
}

export function collectQuickThoughtScheduledItems(items: unknown[] = []): ScheduledQuestLike[] {
  if (!Array.isArray(items)) return [];
  return items.map((raw, index) => {
    const item = raw as Partial<ScheduledQuestLike>;
    const durationMinutes = parseDurationMinutes(item.durationMinutes ?? item.duration, 30);
    const classification = inferScheduledClassification(item);
    return {
      id: String(item.id ?? `quick-thought-${index}`),
      source: "quickThought",
      title: getItemTitle(item),
      text: item.text,
      task: item.task,
      note: item.note,
      type: item.type,
      date: item.date ?? item.dateKey,
      weekday: item.weekday,
      startTime: item.startTime ?? item.time,
      time: item.time ?? item.startTime,
      duration: item.duration ?? formatDurationLabel(durationMinutes),
      durationMinutes,
      steps: item.steps ?? getQuickThoughtSteps(durationMinutes),
      status: item.status ?? "scheduled",
      kind: "quickThought",
      classification,
      createdAt: item.createdAt,
      completedAt: item.completedAt,
    };
  });
}

function normalizeChecklistItems(raw: unknown): unknown[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object") {
    return Object.values(raw as Record<string, unknown>).flatMap((value) => Array.isArray(value) ? value : []);
  }
  return [];
}

export function collectDayPlanScheduledItems(plan: unknown, resolveDateForWeekday: (weekday: WeekdayName) => string | undefined | null): ScheduledQuestLike[] {
  if (!plan || typeof plan !== "object") return [];
  const source = plan as Record<string, unknown>;
  const weekdayChecklists = source.weekdayChecklists as Record<string, unknown[]> | undefined;
  if (!weekdayChecklists) return [];

  const scheduledItems: ScheduledQuestLike[] = [];
  const seen = new Set<string>();

  for (const weekday of WEEKDAYS) {
    const date = resolveDateForWeekday(weekday) ?? undefined;
    for (const bucketDay of WEEKDAYS) {
      const bucketItems = weekdayChecklists[bucketDay];
      if (!Array.isArray(bucketItems)) continue;
      bucketItems.forEach((raw, index) => {
        const item = raw as Partial<ScheduledQuestLike> & { weekdays?: WeekdayName[] };
        const itemWeekdays =
          Array.isArray(item.weekdays) && item.weekdays.length > 0 ? item.weekdays : [bucketDay];
        if (!itemWeekdays.includes(weekday)) return;

        const title = getItemTitle(item);
        const id = String(item.id ?? `day-plan-${bucketDay}-${index}-${title}`);
        // Dedupe per (weekday, id) so a habit recurring on several weekdays shows on
        // each of its days — a shared id-only set would drop it from all but one day.
        const seenKey = `${weekday}-${id}`;
        if (seen.has(seenKey)) return;
        seen.add(seenKey);

        const durationMinutes = parseDurationMinutes(item.durationMinutes ?? item.duration, 30);
        const classification = inferScheduledClassification(item);
        scheduledItems.push({
          id,
          source: "dayPlanChecklist",
          title,
          text: item.text,
          task: item.task,
          note: item.note,
          date,
          weekday,
          startTime: item.startTime ?? item.time,
          time: item.time ?? item.startTime,
          duration: item.duration ?? formatDurationLabel(durationMinutes),
          durationMinutes,
          steps: item.steps ?? 1,
          status: item.status ?? (item.checked ? "completed" : "scheduled"),
          kind: "checklist",
          classification,
          checked: Boolean(item.checked),
          createdAt: item.createdAt,
          completedAt: item.completedAt,
        });
      });
    }
  }

  return scheduledItems;
}