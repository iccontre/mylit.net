# MYLIT Agent Architecture

## Vision

MYLIT exists to help users live in truth and move toward the life they actually
want — career, body, friendships, purpose, confidence, sleep, recovery, and daily
progress. It should feel like a personal life-path system, not a to-do app:
**Evie** helps users build their future, **Luna** helps users recover, reflect,
and keep going.

This document describes the long-term agent architecture MYLIT is being built
toward. As of this doc, **none of these agents call an external AI model.**
Everything described here is typed data + deterministic (non-AI) helper
functions. AI calls, HealthKit/Apple Health permissions, wearable connections,
and EEG integrations are explicitly out of scope until a later phase.

## Components

### 1. MYLIT Orchestrator
Builds one safe context snapshot (`AgentContextSnapshot`) from local data and
decides what each guide/system actually needs. Nothing downstream reads raw
storage directly — they read the snapshot, so every consumer sees the same
consistent view of "where the user is right now." See
`buildAgentContextSnapshot()` in `lib/mylitAgents.ts`.

### 2. Evie — Path Agent
Success/path guide. Helps the user turn a dream into concrete
career/body/friendship/purpose/confidence goals, and turns those into 2-week,
1-month, and 3-month direction. Longer term, Evie helps form real pipelines —
career paths, skill plans, daily quests. Today, Evie's output
(`EviePathSummary`) is a short, deterministic summary built from
`UserLifeProfile` + `StatsInsight[]` — no model call.

### 3. Luna — Sleep + Support Agent
Support/recovery guide. Handles sleep, recovery, reflection, emotional
heaviness, missed quests, and low-energy days — without shame. Luna's output
(`LunaSupportSummary`) is built the same deterministic way, from sleep/recovery
check-in data and stats insights.

### 4. Calendar Agent
Goal-setter / time planner. Turns goals into daily/weekly scheduling
suggestions, balancing progress tasks, recovery tasks, sleep guides, and energy
limits (the existing Progress/Recovery caps in `lib/questProgress.ts`).
Currently expressed as `CalendarPlanningSummary` — descriptive guidance only,
no auto-scheduling yet.

### 5. Stats Agent — the feedback loop
Not passive. Reads completed/missed quests, steps, energy trends, sleep
check-ins, reflections/log history, checklist consistency, and
progress/recovery balance, and turns them into small, plain-language
`StatsInsight[]` (e.g. "You complete Recovery tasks more consistently than
Progress tasks," "Sleep interruptions line up with missed Progress tasks").
These insights feed into Evie's, Luna's, and Calendar's summaries so guidance
can improve over time — this is the loop that makes MYLIT feel like it's
actually paying attention.

### 6. UI/UX Immersion Agent
Protects the pixel/RPG feeling. A non-AI checklist
(`buildUiUxImmersionSummary()`) that can evaluate a screen's metadata/notes
against a small set of criteria — title centered, guide present, pixel/RPG
styling preserved, clear primary action, mode-correct colors, mobile-safe
layout, no cluttered text blocks. This is a foundation for later automated or
AI-assisted review, not a replacement for human design review today.

### 7. Biomarker Adapter
Normalized data model only, manual check-in data for now.
`BiomarkerSnapshot` supports a `source` field (`manual | apple_health |
apple_watch | oura | whoop | fitbit | garmin | eeg | unknown`) and a
`permissionStatus` field so the SAME shape can be reused later without a
migration, once real device integrations are added. **No HealthKit
permissions, wearable SDKs, or EEG integrations exist yet — this phase is
manual-entry only.**

## Safety notes

- MYLIT provides wellness support, not medical diagnosis or treatment. Nothing
  in this system should imply a clinical claim.
- Health/biomarker data is **opt-in only**. A user who never opens the
  biomarker screen has "not_requested" permission status and nothing is
  collected.
- Health/biomarker data is never used for ads or marketing, and is never sold
  or shared with third parties for those purposes.
- A user can fully use MYLIT — Path, Quest Board, Calendar, Sleep, Stats —
  without ever granting any health/biomarker permission. This will remain true
  once real device integrations (Apple Health, wearables, EEG) are added.
- No AI API calls exist anywhere in this system yet. When they're added, this
  document must be updated with the provider, data sent, and retention policy
  before shipping.

## Data flow (today)

```
UserLifeProfile (lit_user_life_profile)   ─┐
GuideMemory (lit_guide_memory)             ├─▶ buildAgentContextSnapshot()
StatsInsight[] (lit_stats_insights)        │        │
BiomarkerSnapshot[] manual only            ─┘        ▼
                                            AgentContextSnapshot (lit_agent_context_snapshot)
                                                       │
                        ┌──────────────────────────────┼──────────────────────────────┐
                        ▼                              ▼                              ▼
              EviePathSummary                LunaSupportSummary          CalendarPlanningSummary
```

All of the above are plain TypeScript objects computed by pure functions in
`lib/mylitAgents.ts` (types in `lib/agentTypes.ts`). Nothing here calls a
network API. Storage/sync follows the existing local-first
`persistProgressKeys` system in `lib/progressStore.ts` — see that file's merge
rules for how each new key is reconciled across devices.
