---
name: mylit-token-save
description: Reduce token usage during MYLIT tasks.
---

Use this when context is getting large or the task is broad.

Rules:
1. Read only the smallest necessary file set.
2. Prefer `rg`/grep for exact symbols before opening files.
3. Do not paste large file contents into chat.
4. Summarize findings instead of dumping logs.
5. Put repeated procedures into `.claude/skills/`.
6. Put stable project facts into `CLAUDE.md`, but keep it short.
7. Use subagents only for noisy side tasks, then return a short summary.
8. Use `/compact` after a major phase finishes.
9. Use `.agent/plans/CURRENT_PLAN.md` as the shared task plan instead of re-explaining the whole task in chat.
