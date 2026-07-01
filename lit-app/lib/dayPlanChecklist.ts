import type { WeekdayName } from "./scheduling";

/** Pre-beta auto-seeded checklist titles — never show these as defaults again. */
export const LEGACY_DEFAULT_CHECKLIST_TITLES = new Set([
  "Coding session",
  "Gym",
  "Read",
  "Meal prep",
  "Walk",
  "Journal",
  "Habit action",
]);

type ChecklistLike = { text?: string; title?: string };

export function isLegacyDefaultChecklistTitle(value: string | undefined): boolean {
  const title = (value ?? "").trim();
  if (!title) return true;
  return LEGACY_DEFAULT_CHECKLIST_TITLES.has(title);
}

export function stripLegacyDefaultChecklistItems<T extends ChecklistLike>(items: T[] | undefined): T[] {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => !isLegacyDefaultChecklistTitle(item.text ?? item.title));
}

export function sanitizeDayPlanChecklists(
  weekdayChecklists: Partial<Record<WeekdayName, ChecklistLike[]>> | undefined
): Partial<Record<WeekdayName, ChecklistLike[]>> {
  if (!weekdayChecklists || typeof weekdayChecklists !== "object") return {};
  const next: Partial<Record<WeekdayName, ChecklistLike[]>> = {};
  for (const [day, items] of Object.entries(weekdayChecklists)) {
    const cleaned = stripLegacyDefaultChecklistItems(items);
    if (cleaned.length > 0) {
      next[day as WeekdayName] = cleaned;
    }
  }
  return next;
}
