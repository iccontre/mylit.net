# MYLIT Agent Instructions

Project: MYLIT teen/college sleep + productivity app.
Live app: https://mylit.net
Vercel project: mylit-beta
Supabase project ref: qepkwlchduhnqzeegpeh
App directory: /workspace/lit-app

## Main rule
Production deploys from `main`. Finished work must be committed to `main`, pushed, and deployed from `/workspace/lit-app`.

## Do not break
- Do not reset user progress.
- Do not clear AsyncStorage/localStorage.
- Do not overwrite non-empty local/cloud data with empty data.
- Do not use service_role in frontend code.
- Do not commit `.env`, `.env.local`, `.vercel`, tokens, or secrets.
- Preserve mobile-first iPhone/PWA layout.

## Use skills instead of long prompts
- Use `/mylit-plan` before broad tasks.
- Use `/mylit-ship` before commit/push/deploy.
- Use `/mylit-supabase` if migrations changed.
- Use `/mylit-pwa` for cache/update/version issues.
- Use `/mylit-token-save` when context is getting large.

## Required tests before shipping
cd /workspace/lit-app
npx tsc --noEmit
npx expo export -p web

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
