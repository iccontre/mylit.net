# AGENTS.md

## Cursor Cloud specific instructions

This repo is an Expo (React Native) app. The runnable code lives in `lit-app/`; the
repo root only holds workspace metadata.

### Services

- **`lit-app` (Expo app)** — single service. Targets web, iOS, and Android from one
  codebase. In the cloud VM only the **web** target is runnable (no iOS/Android
  emulators).

### Running / lint / test (run from `lit-app/`)

- Dev server (web): `npm run web` — serves on `http://localhost:8081` (Metro bundler).
  First bundle takes ~10-15s; wait for `Web Bundled ... entry.js` in the log.
- Lint: `npm run lint` (Expo ESLint). Currently reports pre-existing errors
  (mostly `react/no-unescaped-entities`) plus warnings — these are not caused by
  environment setup; do not "fix" them unless the task asks.
- Typecheck: `npx tsc --noEmit`. Currently reports a pre-existing error in
  `constants/mobileLayout.ts` (`position: "fixed"` not in RN `ViewStyle`); this is
  a known code-level issue, not an environment problem.
- There is no automated test suite (no Jest/test scripts configured).

### Non-obvious notes

- All dependencies are installed inside `lit-app/`, not the repo root. Run npm
  commands from `lit-app/`.
- On `npm run web`, Expo prints warnings that some package versions don't match its
  expected versions (e.g. async-storage). These are non-fatal; the app bundles and
  runs fine — do not "fix" them unless asked.
- App state (onboarding, check-ins) persists via AsyncStorage (browser localStorage on
  web), so a hard reload keeps prior data; clear site data to start fresh.
- Supabase is optional for local development: with no `EXPO_PUBLIC_SUPABASE_*` env vars,
  the app runs fully local-first (AsyncStorage). The `/welcome` → `/auth` entry path
  dead-ends on a "Supabase not ready" screen (the offline button only renders when
  Supabase is configured), but the whole app is still reachable offline — navigate the
  browser directly to `http://localhost:8081/onboarding` (allowed with no redirect), or
  to the root `http://localhost:8081/` once welcome has been seen, and it routes into
  onboarding → the main tabs. Account sync (cross-device) requires the anon key.

### Progress safety (never reset user data)

**Every commit, deploy, and code change must preserve existing user progress.**

- Do **not** call `AsyncStorage.clear()`, `multiRemove` on progress keys, or wipe
  local storage on app boot, sign-in, sync, or version updates.
- Do **not** overwrite non-empty local progress with empty cloud/default payloads.
- Do **not** change default values in a way that replaces saved user data on load
  (e.g. re-seed checklist items, reset steps/rank/completions).
- New defaults apply only when **no saved value exists** for that key — existing
  users keep what they already saved.
- Before any cloud merge: back up local progress (`backupLocalProgressNow` /
  `mergeCloudIntoLocalSafely` in `lit-app/lib/progressStore.ts`).
- Deprecating a field: hide it in UI and ignore it in merge logic; do not delete
  stored rows unless the user explicitly asks.
- If a migration is required, merge forward — never destructive reset.
