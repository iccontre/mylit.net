/**
 * Hunger/fuel estimate — a supportive, timestamp-derived approximation of "how long since you
 * last ate," never a calorie/weight/medical calculation. Fuel is always DERIVED fresh from the
 * FoodLog history at read time (see computeFuel) — nothing decrements it on an interval, so the
 * same history always produces the same number on any device at any moment.
 */

export type FoodEntryType = "meal" | "snack";

export type FoodLog = {
  id: string;
  userId: string;
  eatenAt: string;
  entryType: FoodEntryType;
  note?: string;
  logicalDayKey: string;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_FUEL_INTERVAL_MINUTES = 300;
export const MIN_FUEL_INTERVAL_MINUTES = 240;
export const MAX_FUEL_INTERVAL_MINUTES = 360;
export const MIN_INTERVALS_FOR_PERSONALIZATION = 7;
export const SNACK_FUEL_BOOST = 35;
/** Fuel at/below this activates Luna's "Eat to restore energy" mandatory gate. */
export const FOOD_GATE_FUEL_THRESHOLD = 29;

export type FuelStatus = "Fueled" | "Running Low" | "Time to Eat";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sortByEatenAt(logs: FoodLog[]): FoodLog[] {
  return [...logs].sort((a, b) => new Date(a.eatenAt).getTime() - new Date(b.eatenAt).getTime());
}

/** Minutes from `a` to `b` (both ISO timestamps); NaN if either fails to parse. */
function minutesBetween(a: string, b: string): number {
  const at = new Date(a).getTime();
  const bt = new Date(b).getTime();
  if (!Number.isFinite(at) || !Number.isFinite(bt)) return NaN;
  return (bt - at) / 60000;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * A near-duplicate log — same entry type within 5 minutes of an existing log's eatenAt. Used to
 * stop a double-tap/rapid-resubmit from creating two logs that would each independently reset
 * fuel; the array-merge-by-id path (progressStore.ts) already handles exact-id replays, this
 * catches the "two different ids, same real event" case.
 */
export function isDuplicateFoodLog(logs: FoodLog[], candidate: Pick<FoodLog, "eatenAt" | "entryType">): boolean {
  return logs.some(
    (log) =>
      log.entryType === candidate.entryType &&
      Math.abs(minutesBetween(log.eatenAt, candidate.eatenAt)) < 5
  );
}

/**
 * Rolling-median personalized full-to-empty interval, learned from consecutive MAIN MEAL
 * intervals only (a snack doesn't anchor a full refuel, so it's excluded from interval
 * learning). Implausible gaps are dropped rather than skewing the estimate: under 90 minutes
 * isn't a real second meal, and over 20 hours is a missed/irregular day, not a "typical"
 * interval. Falls back to the safe default until at least MIN_INTERVALS_FOR_PERSONALIZATION
 * valid intervals exist, and is always clamped to a safe 240–360 minute range even once learned.
 */
export function computePersonalizedFuelInterval(logs: FoodLog[]): number {
  const meals = sortByEatenAt(logs.filter((log) => log.entryType === "meal"));
  const intervals: number[] = [];
  for (let i = 1; i < meals.length; i += 1) {
    const minutes = minutesBetween(meals[i - 1].eatenAt, meals[i].eatenAt);
    if (Number.isFinite(minutes) && minutes >= 90 && minutes <= 20 * 60) {
      intervals.push(minutes);
    }
  }
  if (intervals.length < MIN_INTERVALS_FOR_PERSONALIZATION) return DEFAULT_FUEL_INTERVAL_MINUTES;

  // Rolling window — don't let months-old history outweigh recent, more relevant patterns.
  const recent = intervals.slice(-30);
  const med = median(recent);
  if (med === null) return DEFAULT_FUEL_INTERVAL_MINUTES;
  return clamp(Math.round(med), MIN_FUEL_INTERVAL_MINUTES, MAX_FUEL_INTERVAL_MINUTES);
}

export function fuelStatusForValue(fuel: number): FuelStatus {
  if (fuel >= 60) return "Fueled";
  if (fuel >= 30) return "Running Low";
  return "Time to Eat";
}

export type FuelResult = {
  fuel: number;
  status: FuelStatus;
  intervalMinutes: number;
};

/**
 * Derives the CURRENT fuel value purely from timestamps — see module docstring. Folds the
 * sorted log history into a running "anchor" (the fuel value right after the most recent food
 * event, and when that event happened), then linearly decays from that anchor to `now` over the
 * personalized interval. A meal resets the anchor to 100; a snack adds 35 (capped 100) to
 * whatever the decayed value was at the moment of the snack.
 */
export function computeFuel(logs: FoodLog[], now: Date = new Date()): FuelResult {
  const intervalMinutes = computePersonalizedFuelInterval(logs);
  const sorted = sortByEatenAt(logs.filter((log) => Number.isFinite(new Date(log.eatenAt).getTime())));

  if (sorted.length === 0) {
    return { fuel: 100, status: "Fueled", intervalMinutes };
  }

  let anchorFuel = 100;
  let anchorAt = sorted[0].eatenAt;

  sorted.forEach((log, index) => {
    if (index === 0) {
      anchorFuel = log.entryType === "meal" ? 100 : clamp(100 + SNACK_FUEL_BOOST, 0, 100);
      anchorAt = log.eatenAt;
      return;
    }
    const elapsed = Math.max(0, minutesBetween(anchorAt, log.eatenAt));
    const decayedAtLog = clamp(anchorFuel - (elapsed / intervalMinutes) * 100, 0, 100);
    anchorFuel = log.entryType === "meal" ? 100 : clamp(decayedAtLog + SNACK_FUEL_BOOST, 0, 100);
    anchorAt = log.eatenAt;
  });

  const elapsedToNow = Math.max(0, minutesBetween(anchorAt, now.toISOString()));
  const fuel = Math.round(clamp(anchorFuel - (elapsedToNow / intervalMinutes) * 100, 0, 100));
  return { fuel, status: fuelStatusForValue(fuel), intervalMinutes };
}

/** Today's (or any logical day's) first and last MEAL timestamps, derived from the log itself. */
export function computeFirstLastMealForDay(
  logs: FoodLog[],
  logicalDayKey: string
): { firstMealAt: string | null; lastMealAt: string | null } {
  const dayMeals = sortByEatenAt(logs.filter((log) => log.logicalDayKey === logicalDayKey && log.entryType === "meal"));
  if (dayMeals.length === 0) return { firstMealAt: null, lastMealAt: null };
  return { firstMealAt: dayMeals[0].eatenAt, lastMealAt: dayMeals[dayMeals.length - 1].eatenAt };
}

export type MealPatternInsight = {
  medianFirstMealMinutes: number | null;
  medianLastMealMinutes: number | null;
  validDayCount: number;
};

const MIN_VALID_DAYS_FOR_PATTERN = 7;
const PATTERN_ROLLING_DAYS = 14;

function minutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Rolling first/last-meal-time pattern for Luna's sleep-timing insight — supporting information
 * only (see lib/scheduling.ts / sleep-checkin.tsx for the actual bedtime/wake fields, which this
 * never writes to). Needs at least 7 valid days before returning a real pattern; prefers the
 * most recent 14 days.
 */
export function computeMealPatternInsight(logs: FoodLog[]): MealPatternInsight {
  const byDay = new Map<string, FoodLog[]>();
  for (const log of logs) {
    if (log.entryType !== "meal") continue;
    const list = byDay.get(log.logicalDayKey);
    if (list) list.push(log);
    else byDay.set(log.logicalDayKey, [log]);
  }

  const days = [...byDay.keys()].sort().slice(-PATTERN_ROLLING_DAYS);
  if (days.length < MIN_VALID_DAYS_FOR_PATTERN) {
    return { medianFirstMealMinutes: null, medianLastMealMinutes: null, validDayCount: days.length };
  }

  const firstTimes: number[] = [];
  const lastTimes: number[] = [];
  for (const day of days) {
    const dayLogs = sortByEatenAt(byDay.get(day) ?? []);
    if (dayLogs.length === 0) continue;
    firstTimes.push(minutesOfDay(dayLogs[0].eatenAt));
    lastTimes.push(minutesOfDay(dayLogs[dayLogs.length - 1].eatenAt));
  }

  return {
    medianFirstMealMinutes: median(firstTimes),
    medianLastMealMinutes: median(lastTimes),
    validDayCount: days.length,
  };
}
