# mylit.net

A sleep & productivity companion app — journaling, intention setting, dream tracking, and habit-aware planning, in one place.

> Built with React Native + Expo Router. Ships to web, iOS, and Android from a single codebase.

---

## What's inside

The app guides a daily loop:

- **Morning** — onboarding, morning intention & reflection
- **Day** — day plan, tomorrow queue, journal, next-chapter prompts
- **Pre-sleep** — pre-sleep intention, sleep check-in, awareness check
- **Sleep** — dream journal, sleep calendar
- **Review** — weekly summary, stats, mind/path overviews

Quest pipelines (see `lit-app/constants/questPipelines.ts`) tie these together into adaptive flows.

---

## Tech stack

- **Framework**: [Expo](https://expo.dev) (SDK 54) + [Expo Router](https://docs.expo.dev/router/introduction/) for file-based navigation
- **Language**: TypeScript 5.9
- **UI**: React 19 + React Native 0.81, React Navigation, Expo Symbols / Vector Icons
- **Storage**: `@react-native-async-storage/async-storage`
- **Animation / Gestures**: `react-native-reanimated`, `react-native-gesture-handler`

---

## Getting started

```bash
git clone https://github.com/iccontre/mylit.net.git
cd mylit.net/lit-app
npm install
```

Then run on whatever target you want:

```bash
npm run web       # open in browser  →  http://localhost:8081
npm run ios       # iOS Simulator (requires Xcode on macOS)
npm run android   # Android emulator (requires Android Studio)
npm start         # interactive menu (press w / i / a, or scan QR for Expo Go on a phone)
```

---

## Repository layout

```
mylit.net/
├── README.md
├── package.json            # root workspace metadata
└── lit-app/                # the Expo application
    ├── app/                # screens (file-based routing via expo-router)
    │   ├── (tabs)/         # bottom-tab navigation
    │   ├── onboarding.tsx
    │   ├── journal.tsx
    │   ├── dream-journal.tsx
    │   ├── sleep-checkin.tsx
    │   ├── weekly-summary.tsx
    │   └── …               # 20+ screens total
    ├── components/         # shared UI components
    ├── constants/
    │   └── questPipelines.ts  # quest / flow definitions
    ├── hooks/
    ├── assets/
    └── package.json
```

---

## Scripts (inside `lit-app/`)

| Command | Description |
|---|---|
| `npm run web` | Start the Expo web dev server on `localhost:8081` |
| `npm run ios` | Start the iOS Simulator build |
| `npm run android` | Start the Android emulator build |
| `npm start` | Start Metro with the interactive target picker |
| `npm run lint` | Run the Expo lint configuration |
| `npm run reset-project` | Reset to the Expo starter template (destructive) |

---

## Contributing

1. Branch off `main`: `git checkout -b <yourname>/<feature>`
2. Make changes inside `lit-app/`
3. Verify on web with `npm run web` before opening a PR
4. Open a PR against `main`
