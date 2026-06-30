---
description: Use for MYLIT UI polish, screen sizing, mobile layout fixes, bottom-nav consistency, pixel/RPG styling, image asset usage, and first-beta visual cleanup.
---

# MYLIT UI Polish Skill

You are editing MYLIT, a mobile-first teen/young-adult productivity and sleep app.

## Product rules
- MYLIT means Living in Truth.
- Recovery is valid progress.
- Missed goals are data, not failure.
- Avoid shame-based productivity language.

## UI rules
- Preserve the current dark pixel/RPG/adventure aesthetic.
- Do not restore old bright/yellow UI.
- Keep the bottom nav intact.
- Keep layouts mobile-first and iPhone-friendly.
- Avoid giant empty spaces and horizontal overflow.
- Use existing assets from `lit-app/assets/ui` and `lit-app/constants/uiAssets.ts`.
- Luna guides sleep/mind/recovery reassurance.
- Evie guides progress/path/calendar/stats unless the task says otherwise.

## File discipline
- Inspect current files before editing.
- Modify only the files needed for the task.
- Do not redesign unrelated pages.
- Do not rename routes unless explicitly asked.
- Preserve AsyncStorage keys unless explicitly asked.

## After editing
Run:
cd lit-app && npx tsc --noEmit

Report:
- changed files
- behavior changed
- TypeScript result
- what Isaac should test manually
