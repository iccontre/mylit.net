---
name: mylit-plan
description: Create a short, token-efficient implementation plan for a MYLIT task before editing.
---

Use this skill before broad MYLIT changes.

Steps:
1. Read `/workspace/.agent/docs/MYLIT_QUICK_CONTEXT.md`.
2. Read `/workspace/.agent/plans/TASK_TEMPLATE.md`.
3. Identify the smallest file set needed.
4. Do not scan the whole repo unless necessary.
5. Produce a concise plan with:
   - files to inspect
   - expected data risks
   - implementation steps
   - tests
6. Ask for confirmation only if the requested change is ambiguous or could delete user data.
