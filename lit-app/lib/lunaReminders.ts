import type { QuestCategory } from "./agentTypes";
import { parseTimeToMinutes, type WeekdayName } from "./scheduling";

/** Which guide this reminder belongs to — feeds Calendar color, guide modal filtering, and history. */
export type ReminderGuide = "evie" | "luna";

/**
 * Shared reminder type for both guides, kept under its original name/storage key
 * (LUNA_DAY_REMINDERS_KEY) so existing cross-device sync/merge-by-id behavior is untouched.
 * `guide` is optional so every reminder saved before this field existed keeps working —
 * treat a missing guide as "luna" everywhere (see reminderGuide()).
 */
export type LunaDayReminder = {
  id: string;
  guide?: ReminderGuide;
  text: string;
  time?: string;
  until?: string;
  durationMinutes?: number;
  category?: QuestCategory;
  /** New repeat-day model — any weekday this reminder should show on. */
  weekdays?: WeekdayName[];
  /** Legacy single-day scoping from before repeat days existed — still honored for old data. */
  dateKey?: string;
  createdAt: string;
  stepAwarded: boolean;
};

/** Missing guide = pre-existing reminder, always created by Luna's flow before Evie reminders existed. */
export function reminderGuide(reminder: LunaDayReminder): ReminderGuide {
  return reminder.guide ?? "luna";
}

/** Matches new weekday-repeat reminders and legacy single-dateKey reminders alike. */
export function isReminderScheduledForDay(reminder: LunaDayReminder, weekday: WeekdayName, dateKey: string): boolean {
  if (reminder.weekdays && reminder.weekdays.length > 0) return reminder.weekdays.includes(weekday);
  if (reminder.dateKey) return reminder.dateKey === dateKey;
  return false;
}

export function isReminderActiveNow(reminder: LunaDayReminder): boolean {
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const start = reminder.time ? parseTimeToMinutes(reminder.time) : null;
  const end = reminder.until ? parseTimeToMinutes(reminder.until) : null;
  if (start !== null && nowMinutes < start) return false;
  if (end !== null && nowMinutes > end) return false;
  return true;
}
