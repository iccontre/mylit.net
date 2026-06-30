/**
 * Rule-based starter checklist defaults derived from the user's saved path.
 *
 * Phase 1: purely rule-based (no AI). Extend the switch cases to add more.
 *
 * TODO: consume this in day-plan/checklist generation. Call
 * `generatePathChecklistDefaults(profile.dreamCategory, profile)` and merge
 * the returned items into the default checklist pool for that user.
 */

export type ChecklistKind = "progress" | "recovery";

export type PathChecklistItem = {
  title: string;
  kind: ChecklistKind;
  durationMinutes: number;
  steps: number;
  source: "path";
};

type PathResources = {
  hasWorkOrSchool?: boolean;
  hasTransportation?: boolean;
  hasGymAccess?: boolean;
  hasQuietSpace?: boolean;
  hasFoodControl?: boolean;
};

export function generatePathChecklistDefaults(
  category: string,
  resources: PathResources = {}
): PathChecklistItem[] {
  const items: PathChecklistItem[] = [];

  function add(title: string, kind: ChecklistKind, durationMinutes: number): void {
    items.push({
      title,
      kind,
      durationMinutes,
      steps: kind === "progress" ? 1 : durationMinutes >= 30 ? 1 : 0,
      source: "path",
    });
  }

  switch (category) {
    case "School / Work":
      add("Focused study/work block", "progress", 45);
      add("Review one assignment or project", "progress", 30);
      if (resources.hasQuietSpace) add("Quiet focus session", "progress", 30);
      add("Clean/reset workspace", "recovery", 20);
      add("Plan tomorrow's first task", "recovery", 10);
      break;

    case "Health":
    case "Health / Fitness":
      add(resources.hasGymAccess ? "Gym session" : "Home workout", "progress", 45);
      add("Walk or mobility session", "progress", 30);
      if (resources.hasFoodControl) add("Prepare a balanced meal", "recovery", 30);
      add("Meal prep or hydrate", "recovery", 20);
      add("Stretch/reset", "recovery", 10);
      break;

    case "Social Life":
    case "Friends / Connection":
      add("Message or check in with someone", "progress", 30);
      add(
        resources.hasTransportation
          ? "Meet someone for coffee or a walk"
          : "Make one social plan",
        "progress",
        30
      );
      add("Reflect on one interaction", "recovery", 10);
      add("Take a confidence reset walk", "recovery", 20);
      break;

    case "Purpose":
    case "Creativity":
      add("Create or build for 30 minutes", "progress", 30);
      add("Skill practice session", "progress", 45);
      add("Journal one honest thought", "recovery", 10);
      add("Read or reflect for 20 minutes", "recovery", 20);
      break;

    default:
      add("One focused work session", "progress", 30);
      add("Review today's progress", "progress", 30);
      add("Rest and reset", "recovery", 20);
      add("Plan tomorrow's first step", "recovery", 10);
  }

  if (resources.hasWorkOrSchool) {
    add("Review one responsibility", "recovery", 10);
    add("Prepare for tomorrow", "recovery", 10);
  }

  return items;
}
