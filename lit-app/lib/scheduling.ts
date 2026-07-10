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
  /** User-set hobby/self-care checklist item — display-only marker (see day-plan.tsx). */
  hobby?: boolean;
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

/** A 2-hour duration is only offered for Today's Quest — it's worth a flat +15 steps. */
export const TODAY_QUEST_TWO_HOUR_MINUTES = 120;
export const TODAY_QUEST_TWO_HOUR_STEPS = 15;
/** A completed 2-hour Progress Today's Quest costs a flat -12 energy (not the generic duration formula). */
export const TODAY_QUEST_TWO_HOUR_ENERGY_COST = 12;

/**
 * Step reward for a quest/checklist item, by duration AND kind:
 * Progress → 15 min = +2, 30 = +4, 45 = +6, 1 hr = +8 (double the base).
 * Recovery → 15 min = +1, 30 = +2, 45 = +3, 1 hr = +4 (base).
 * 2 hr (Today's Quest only) → flat +15, regardless of kind.
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

/**
 * Energy a completed NAP quest restores — a special Recovery subtype with its own tiers,
 * distinct from the generic Recovery quest/checklist values: 15 min → +3, 30 min → +6,
 * 45 min → +9, 60 min → +12 (1 energy per 5 minutes).
 */
export function getNapEnergyRestore(duration?: string | number | null): number {
  const minutes = parseDurationMinutes(duration, 30);
  return Math.max(1, Math.round(minutes / 5));
}

/**
 * Energy the mandatory eat/rest quest restores when completed — tiered by duration so the
 * harder, lower-energy severe tier actually restores more: mild (15 min, triggered under 60
 * energy) → +5, severe (30 min, triggered under 30 energy) → +10. Both restore more per
 * minute than a normal Recovery quest (+2/15min, +4/30min) — that bonus is the incentive to
 * take the mandatory quest over a regular one.
 */
export function getMandatoryQuestRestoreEnergy(durationMinutes?: string | number | null): number {
  const minutes = parseDurationMinutes(durationMinutes, 15);
  return minutes >= 30 ? 10 : 5;
}

/** A nap quest's title always begins with "Nap" so completions can be identified from logs. */
export function isNapTitle(title?: string | null): boolean {
  return /(^|\b)nap\b/i.test(String(title ?? ""));
}

/** Luna's mandatory eat/rest reset — title is stable so completions can be identified from logs (e.g. Calendar). */
export const MANDATORY_QUEST_TITLE = "Eat or rest to restore energy";

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
// Lucid Dreaming Mode's pre-sleep routine quests — no recovery energy, no progress cost. The
// user is winding down, not doing a scheduled task; only the one-time +8 completion bonus
// (awarded in index.tsx once all four are done) matters here.
export const LDM_HYGIENE_TITLE = "Hygiene";
export const LDM_JOURNALING_TITLE = "Journaling";
export const LDM_READING_TITLE = "Reading";
export const LDM_NIGHT_REFLECTION_TITLE = "Night Reflection";
export const LDM_PRE_SLEEP_INTENTION_TITLE = "Set Pre-Sleep Intention";
export const LDM_ROUTINE_TITLES = [
  LDM_HYGIENE_TITLE,
  LDM_JOURNALING_TITLE,
  LDM_READING_TITLE,
  LDM_NIGHT_REFLECTION_TITLE,
  LDM_PRE_SLEEP_INTENTION_TITLE,
] as const;
const LDM_ROUTINE_TITLE_SET = new Set<string>(LDM_ROUTINE_TITLES);

export function isLdmRoutineTitle(title?: string | null): boolean {
  return Boolean(title && LDM_ROUTINE_TITLE_SET.has(title));
}

export function getEnergyDelta(opts: {
  kind?: ScheduledClassification | "progress" | "recovery" | string | null;
  durationMinutes?: string | number | null;
  title?: string | null;
  mandatory?: boolean;
}): number {
  if (isLdmRoutineTitle(opts.title)) return 0;
  if (opts.mandatory) return getMandatoryQuestRestoreEnergy(opts.durationMinutes);
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

/**
 * Places a raw parsed clock time (0–1439) onto the same "day-relative" timeline as
 * `rangeStart`/`rangeEnd` (which may exceed 1439 when a window crosses midnight) by trying
 * +0/+24h/+48h offsets. Used to validate that a sleep interruption's wake/fall-asleep-again
 * time genuinely falls inside the night's sleep window before trusting it.
 */
export function normalizeIntoRange(rawMinutes: number, rangeStart: number, rangeEnd: number): number | null {
  for (const offset of [0, 24 * 60, 48 * 60]) {
    const candidate = rawMinutes + offset;
    if (candidate >= rangeStart && candidate <= rangeEnd) return candidate;
  }
  return null;
}

export type SleepSessionInput = {
  sleptTime: string;
  wokeTime: string;
  interrupted: boolean;
  interruptionWakeTime?: string;
  interruptionSleepAgainTime?: string;
};

export type SleepSessionResult = {
  valid: boolean;
  /** Sleep time → final wake time, cross-midnight aware. */
  totalInBedMinutes: number | null;
  interruptionDurationMinutes: number | null;
  /** Total in bed minus any interruption — the number actually used for bonuses/energy. */
  effectiveSleepMinutes: number | null;
};

/**
 * Shared sleep-session math used by both Morning Check-In (sleep-checkin.tsx) and Morning
 * Reflection (morning-intention-reflection.tsx) so the two screens can never drift apart on
 * how interrupted sleep is calculated. Awake time during an interruption is not sleep — it's
 * subtracted out of the total time in bed to get the effective sleep duration.
 */
export function computeSleepSession(input: SleepSessionInput): SleepSessionResult {
  const empty: SleepSessionResult = { valid: false, totalInBedMinutes: null, interruptionDurationMinutes: null, effectiveSleepMinutes: null };

  const sleptMinutes = parseTimeToMinutes(input.sleptTime);
  const wokeRaw = parseTimeToMinutes(input.wokeTime);
  if (sleptMinutes === null || wokeRaw === null) return empty;

  const finalWakeMinutes = wokeRaw <= sleptMinutes ? wokeRaw + 24 * 60 : wokeRaw;
  const totalInBedMinutes = finalWakeMinutes - sleptMinutes;
  if (totalInBedMinutes <= 0 || totalInBedMinutes > 16 * 60) return empty;

  if (!input.interrupted) {
    return { valid: true, totalInBedMinutes, interruptionDurationMinutes: null, effectiveSleepMinutes: totalInBedMinutes };
  }

  if (!input.interruptionWakeTime || !input.interruptionSleepAgainTime) {
    return { valid: false, totalInBedMinutes, interruptionDurationMinutes: null, effectiveSleepMinutes: null };
  }

  const interruptionWakeRaw = parseTimeToMinutes(input.interruptionWakeTime);
  const interruptionSleepAgainRaw = parseTimeToMinutes(input.interruptionSleepAgainTime);
  if (interruptionWakeRaw === null || interruptionSleepAgainRaw === null) {
    return { valid: false, totalInBedMinutes, interruptionDurationMinutes: null, effectiveSleepMinutes: null };
  }

  const interruptionWakeMinutes = normalizeIntoRange(interruptionWakeRaw, sleptMinutes, finalWakeMinutes);
  const interruptionSleepAgainMinutes =
    interruptionWakeMinutes !== null ? normalizeIntoRange(interruptionSleepAgainRaw, interruptionWakeMinutes, finalWakeMinutes) : null;
  if (interruptionWakeMinutes === null || interruptionSleepAgainMinutes === null) {
    return { valid: false, totalInBedMinutes, interruptionDurationMinutes: null, effectiveSleepMinutes: null };
  }

  const interruptionDurationMinutes = interruptionSleepAgainMinutes - interruptionWakeMinutes;
  const effectiveSleepMinutes = totalInBedMinutes - interruptionDurationMinutes;
  if (effectiveSleepMinutes <= 0) {
    return { valid: false, totalInBedMinutes, interruptionDurationMinutes, effectiveSleepMinutes: null };
  }

  return { valid: true, totalInBedMinutes, interruptionDurationMinutes, effectiveSleepMinutes };
}

/** Fragmentation penalty applied to sleep-quality/energy scores when sleep was interrupted. */
export function sleepInterruptionPenalty(interruptionDurationMinutes: number): number {
  if (interruptionDurationMinutes >= 45) return 12;
  if (interruptionDurationMinutes >= 20) return 8;
  return 5;
}

/**
 * Progress/Recovery tasks can be scheduled after 10 PM, but never extend past midnight —
 * the app's day view and daily cap accounting both stop at 12 AM. Returns true when
 * `startTime` + `durationMinutes` would run into the next day.
 */
export function wouldCrossMidnight(startTime: string | undefined, durationMinutes: number): boolean {
  const startMinutes = parseTimeToMinutes(startTime);
  if (startMinutes === null) return false;
  return startMinutes + durationMinutes > 24 * 60;
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
 * After 120 minutes of *contiguous* (back-to-back, no gap) scheduled PROGRESS items on
 * a day, MYLIT auto-inserts a 1-hour recovery block right after. Recovery items do not
 * contribute to the progress streak — ANY recovery-classified item (regardless of its own
 * duration) breaks/resets the streak, since it means the user already has a break planned
 * there. Mixed Progress + Recovery scheduling therefore never triggers this on its own;
 * only genuinely continuous Progress work does.
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
    // Recovery items do not contribute to progress streaks — any duration breaks the streak.
    const isRecoveryItem = inferScheduledClassification(item) === "recovery";

    if (isRecoveryItem) {
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

/**
 * Every user-scheduled quest/checklist item rolls over for exactly 24 hours past its
 * intended completion time, staying actionable (and markable "Missed?") the whole time.
 * Example: a quest scheduled Wednesday 5:00 PM expires Thursday 5:00 PM.
 */
export const QUEST_ROLLOVER_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The moment an item is "due": its scheduled date + time. When only a date is set (no
 * exact time), the default rule is the end of that date — i.e. the item is due at
 * midnight starting the NEXT day — so the 24-hour rollover window still has a concrete
 * anchor to count from.
 */
export function getScheduledIntendedCompletionMs(item: {
  date?: string;
  dateKey?: string;
  startTime?: string;
  time?: string;
}): number | null {
  const dateStr = item.date ?? item.dateKey;
  if (!dateStr) return null;
  const base = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(base.getTime())) return null;

  const time = item.startTime ?? item.time;
  const minutes = time ? parseTimeToMinutes(time) : null;
  if (minutes !== null) {
    base.setMinutes(base.getMinutes() + minutes);
  } else {
    base.setDate(base.getDate() + 1);
  }
  return base.getTime();
}

/** Intended completion time + the 24-hour rollover window (see QUEST_ROLLOVER_WINDOW_MS). */
export function getScheduledExpiryMs(item: { date?: string; dateKey?: string; startTime?: string; time?: string }): number | null {
  const completion = getScheduledIntendedCompletionMs(item);
  return completion === null ? null : completion + QUEST_ROLLOVER_WINDOW_MS;
}

/** True once an item's 24-hour rollover window has fully elapsed — it should no longer show as an active board item. */
export function isScheduledItemExpired(
  item: { date?: string; dateKey?: string; startTime?: string; time?: string },
  nowMs: number = Date.now()
): boolean {
  const expiry = getScheduledExpiryMs(item);
  return expiry !== null && nowMs >= expiry;
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
          hobby: Boolean((item as { hobby?: boolean }).hobby),
        });
      });
    }
  }

  return scheduledItems;
}