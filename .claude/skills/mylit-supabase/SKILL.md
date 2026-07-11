---
name: mylit-supabase
description: Safely handle MYLIT Supabase migrations and sync changes.
---

Use this when migrations or Supabase-backed data change.

Rules:
- Prefer existing `user_progress_data` key/value sync unless a migration is necessary.
- Never use service_role in frontend code.
- Never commit Supabase access tokens.
- If migrations changed, run:

cd /workspace
if [ -f ~/.mylit-agent-env ]; then source ~/.mylit-agent-env; fi
npx --yes supabase@latest db push

If auth fails, stop and report exactly what credential is missing.
Do not ask Isaac to paste SQL unless CLI auth is unavailable.
