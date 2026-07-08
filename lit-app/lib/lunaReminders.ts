import type { QuestCategory } from "./agentTypes";
import { parseTimeToMinutes, type WeekdayName } from "./scheduling";

export type LunaDayReminder = {
  id: string;
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
