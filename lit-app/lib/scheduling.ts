export type ScheduledKind = "progress" | "recovery";

export type ScheduledStatus =
  | "scheduled"
  | "active"
  | "completed"
  | "expired"
  | "needsReflection"
  | "recoveryRequired";

export type ScheduledQuestLike = {
  id: string;
  source?:
    | "quickThought"
    | "dayPlanChecklist"
    | "todayFocus"
    | "questBoard"
    | "recoveryBlock"
    | string;
  title?: string;
  text?: string;
  task?: string;
  note?: string;
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

const WEEKDAYS: WeekdayName[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const RECOVERY_WORDS = [
  "eat",
  "meal",
  "food",
  "snack",
  "relax",
  "rest",
  "nap",
  "sleep",
  "social",
  "socialize",
  "breathe",
  "breathing",
  "journal",
  "walk",
  "shower",
  "recover",
  "recovery",
  "break",
  "stretch",
  "reset",
];

/**
 * Returns a local YYYY-MM-DD date key.
 * Works with Date, date strings, or no argument.
 */
export function getDateKey(date: Date | string = new Date()): string {
  if (typeof date === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;

    const parsed = new Date(date);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("en-CA");
    }

    return date;
  }

  return date.toLocaleDateString("en-CA");
}

/**
 * Converts "30 min", "45 min", "1 hr", "1 hour", 30, etc. into minutes.
 * The second argument fixes your current errors where files call:
 * parseDurationMinutes(value, 30)
 */
export function parseDurationMinutes(
  value?: string | number | null,
  fallbackMinutes = 30
): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (!value) return fallbackMinutes;

  const normalized = String(value).trim().toLowerCase();

  if (normalized.includes("1 hr") || normalized.includes("1 hour")) {
    return 60;
  }

  const minuteMatch = normalized.match(/(\d+)\s*(min|mins|minute|minutes)/);
  if (minuteMatch?.[1]) {
    return Number(minuteMatch[1]);
  }

  const hourMatch = normalized.match(/(\d+)\s*(hr|hrs|hour|hours)/);
  if (hourMatch?.[1]) {
    return Number(hourMatch[1]) * 60;
  }

  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) return numeric;

  return fallbackMinutes;
}

/**
 * Formats duration for UI labels.
 * Examples:
 * 30 -> "30 min"
 * 60 -> "1 hr"
 * 90 -> "1 hr 30 min"
 */
export function formatDurationLabel(
  value?: string | number | null,
  fallbackMinutes = 30
): string {
  const minutes = parseDurationMinutes(value, fallbackMinutes);

  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return hours === 1 ? "1 hr" : `${hours} hrs`;
  }

  return `${hours} hr ${remainingMinutes} min`;
}

/**
 * Quick Thoughts step rule:
 * 30 min = +1
 * 45 min = +1
 * 1 hr = +2
 */
export function getQuickThoughtSteps(duration?: string | number | null): number {
  return parseDurationMinutes(duration, 30) >= 60 ? 2 : 1;
}

export function inferScheduledKind(item: Partial<ScheduledQuestLike> | any): ScheduledKind {
  if (item?.kind === "progress" || item?.kind === "recovery") {
    return item.kind;
  }

  const text = String(item?.title ?? item?.text ?? item?.task ?? "").toLowerCase();

  if (RECOVERY_WORDS.some((word) => text.includes(word))) {
    return "recovery";
  }

  return "progress";
}

function getItemTitle(item: any): string {
  return String(item?.title ?? item?.text ?? item?.task ?? item?.name ?? "Scheduled item");
}

function getItemStartTime(item: Partial<ScheduledQuestLike> | any): string | undefined {
  return item?.startTime ?? item?.time;
}

function getItemDate(item: Partial<ScheduledQuestLike> | any): string | undefined {
  return item?.date ?? item?.dateKey;
}

function parseTimeToMinutes(time?: string | null): number | null {
  if (!time) return null;

  const raw = String(time).trim();
  const normalized = raw.toUpperCase();

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
  if (match24) {
    return Number(match24[1]) * 60 + Number(match24[2]);
  }

  return null;
}

function formatMinutesAsTime(minutes: number): string {
  const safe = ((minutes % 1440) + 1440) % 1440;
  const hour24 = Math.floor(safe / 60);
  const minute = safe % 60;
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

function getRange(item: Partial<ScheduledQuestLike> | any) {
  const start = parseTimeToMinutes(getItemStartTime(item));
  if (start === null) return null;

  const duration = parseDurationMinutes(item?.durationMinutes ?? item?.duration, 30);

  return {
    start,
    end: start + duration,
    duration,
  };
}

function sameScheduledDay(
  a: Partial<ScheduledQuestLike>,
  b: Partial<ScheduledQuestLike>
): boolean {
  const aDate = getItemDate(a);
  const bDate = getItemDate(b);

  if (aDate && bDate) return aDate === bDate;

  if (a.weekday && b.weekday) {
    return String(a.weekday).toLowerCase() === String(b.weekday).toLowerCase();
  }

  return false;
}

export function findScheduleOverlap(
  candidate: Partial<ScheduledQuestLike>,
  existingItems: Partial<ScheduledQuestLike>[],
  ignoreId?: string
): Partial<ScheduledQuestLike> | null {
  const candidateRange = getRange(candidate);
  if (!candidateRange) return null;

  for (const item of existingItems) {
    if (!item) continue;
    if (ignoreId && item.id === ignoreId) continue;
    if (candidate.id && item.id === candidate.id) continue;
    if (!sameScheduledDay(candidate, item)) continue;

    const itemRange = getRange(item);
    if (!itemRange) continue;

    const overlaps =
      candidateRange.start < itemRange.end && itemRange.start < candidateRange.end;

    if (overlaps) return item;
  }

  return null;
}

export function requiresRecoveryBeforeNewProgress(
  candidate: Partial<ScheduledQuestLike>,
  existingItems: Partial<ScheduledQuestLike>[]
): boolean {
  if (inferScheduledKind(candidate) !== "progress") return false;

  const candidateRange = getRange(candidate);
  if (!candidateRange) return false;

  const sameDayItems = existingItems
    .filter((item) => sameScheduledDay(candidate, item))
    .filter((item) => item.status !== "expired" && item.status !== "needsReflection")
    .filter((item) => getRange(item) !== null)
    .sort((a, b) => {
      const aRange = getRange(a);
      const bRange = getRange(b);
      return (aRange?.start ?? 0) - (bRange?.start ?? 0);
    });

  let progressMinutes = 0;

  for (const item of sameDayItems) {
    const range = getRange(item);
    if (!range) continue;

    if (range.start >= candidateRange.start) break;

    const kind = inferScheduledKind(item);

    if (kind === "recovery") {
      if (range.duration >= 60) progressMinutes = 0;
      continue;
    }

    progressMinutes += range.duration;

    if (progressMinutes >= 120) {
      return true;
    }
  }

  return false;
}

export function getRequiredRecoveryBlockForDate(
  items: Partial<ScheduledQuestLike>[],
  date: string
): ScheduledQuestLike | null {
  const dayItems = items
    .filter((item) => getItemDate(item) === date)
    .filter((item) => item.status !== "expired" && item.status !== "needsReflection")
    .filter((item) => getRange(item) !== null)
    .sort((a, b) => {
      const aRange = getRange(a);
      const bRange = getRange(b);
      return (aRange?.start ?? 0) - (bRange?.start ?? 0);
    });

  let progressMinutes = 0;
  let requiredStart: number | null = null;

  for (const item of dayItems) {
    const range = getRange(item);
    if (!range) continue;

    const kind = inferScheduledKind(item);

    if (kind === "recovery") {
      if (range.duration >= 60) {
        progressMinutes = 0;
        requiredStart = null;
      }
      continue;
    }

    progressMinutes += range.duration;

    if (progressMinutes >= 120) {
      requiredStart = range.end;
      break;
    }
  }

  if (requiredStart === null) return null;

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
    isMandatoryRecovery: true,
  };
}

export function collectQuickThoughtScheduledItems(items: any[] = []): ScheduledQuestLike[] {
  if (!Array.isArray(items)) return [];

  return items.map((item, index) => {
    const durationMinutes = parseDurationMinutes(item?.durationMinutes ?? item?.duration, 30);

    return {
      id: String(item?.id ?? `quick-thought-${index}`),
      source: "quickThought",
      title: getItemTitle(item),
      text: item?.text,
      task: item?.task,
      note: item?.note,
      date: item?.date ?? item?.dateKey,
      weekday: item?.weekday,
      startTime: item?.startTime ?? item?.time,
      time: item?.time ?? item?.startTime,
      duration: item?.duration ?? formatDurationLabel(durationMinutes),
      durationMinutes,
      steps: item?.steps ?? getQuickThoughtSteps(durationMinutes),
      status: item?.status ?? "scheduled",
      kind: inferScheduledKind(item),
      createdAt: item?.createdAt,
      completedAt: item?.completedAt,
    };
  });
}

function normalizeChecklistItems(raw: any): any[] {
  if (!raw) return [];

  if (Array.isArray(raw)) return raw;

  if (typeof raw === "object") {
    return Object.values(raw).flatMap((value) => {
      if (Array.isArray(value)) return value;
      return [];
    });
  }

  return [];
}

export function collectDayPlanScheduledItems(
  plan: any,
  resolveDateForWeekday: (weekday: WeekdayName) => string | undefined | null
): ScheduledQuestLike[] {
  if (!plan) return [];

  const scheduledItems: ScheduledQuestLike[] = [];

  for (const weekday of WEEKDAYS) {
    const short = weekday.slice(0, 3).toUpperCase();
    const lower = weekday.toLowerCase();

    const possibleSources = [
      plan?.checklist?.[weekday],
      plan?.checklist?.[short],
      plan?.checklist?.[lower],
      plan?.checklists?.[weekday],
      plan?.checklists?.[short],
      plan?.checklists?.[lower],
      plan?.habitChecklist?.[weekday],
      plan?.habitChecklist?.[short],
      plan?.habitChecklist?.[lower],
      plan?.weeklyChecklist?.[weekday],
      plan?.weeklyChecklist?.[short],
      plan?.weeklyChecklist?.[lower],
      plan?.weeklyHabitChecklist?.[weekday],
      plan?.weeklyHabitChecklist?.[short],
      plan?.weeklyHabitChecklist?.[lower],
      plan?.dayChecklists?.[weekday],
      plan?.dayChecklists?.[short],
      plan?.dayChecklists?.[lower],
      plan?.[weekday]?.checklist,
      plan?.[short]?.checklist,
      plan?.[lower]?.checklist,
    ];

    const items = possibleSources.flatMap(normalizeChecklistItems);
    const date = resolveDateForWeekday(weekday) ?? undefined;

    items.forEach((item: any, index: number) => {
      if (!item) return;

      const title = getItemTitle(item);
      const durationMinutes = parseDurationMinutes(item?.durationMinutes ?? item?.duration, 30);

      scheduledItems.push({
        id: String(item?.id ?? `day-plan-${weekday}-${index}-${title}`),
        source: "dayPlanChecklist",
        title,
        text: item?.text,
        task: item?.task,
        note: item?.note,
        date,
        weekday,
        startTime: item?.startTime ?? item?.time,
        time: item?.time ?? item?.startTime,
        duration: item?.duration ?? formatDurationLabel(durationMinutes),
        durationMinutes,
        steps: item?.steps ?? 1,
        status: item?.status ?? (item?.checked ? "completed" : "scheduled"),
        kind: inferScheduledKind(item),
        checked: Boolean(item?.checked),
        createdAt: item?.createdAt,
        completedAt: item?.completedAt,
      });
    });
  }

  return scheduledItems;
}