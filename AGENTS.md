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
- Lint: `npm run lint` (Expo ESLint). Currently passes with warnings only, no errors.
- Typecheck: `npx tsc --noEmit`.
- There is no automated test suite (no Jest/test scripts configured).

### Non-obvious notes

- All dependencies are installed inside `lit-app/`, not the repo root. Run npm
  commands from `lit-app/`.
- On `npm run web`, Expo prints warnings that some package versions don't match its
  expected versions (e.g. async-storage). These are non-fatal; the app bundles and
  runs fine — do not "fix" them unless asked.
- App state (onboarding, check-ins) persists via AsyncStorage (browser localStorage on
  web), so a hard reload keeps prior data; clear site data to start fresh.
