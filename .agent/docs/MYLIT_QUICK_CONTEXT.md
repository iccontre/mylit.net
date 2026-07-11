# MYLIT Quick Context

MYLIT is a sleep + energy + quest productivity app for late teens/college students.

Core loop:
Sleep → Energy Mode → Goals → Quests → Reflection → Progress

Important routes/features:
- Home Quest Board: / or app/(tabs)/index.tsx
- Quests: app/tomorrow-queue.tsx
- Day Plan: app/day-plan.tsx
- Calendar: app/calendar.tsx
- Stats/Profile: app/stats.tsx
- Sleep: app/sleep.tsx, pre-sleep-intention, dream-journal, morning reflection
- Mind: journal, meditations, reflection
- Sync: lib/progressStore.ts, lib/storageKeys.ts, components/AuthBootstrap.tsx

Deployment:
- Production builds from main.
- Vercel project: mylit-beta.
- Supabase project ref: qepkwlchduhnqzeegpeh.
