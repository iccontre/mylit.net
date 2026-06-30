---
description: Use when Isaac asks what changed, wants a commit message, wants a safety review, or wants to check whether Cursor/Claude modified too much.
---

# MYLIT Diff Review

Summarize current changes in plain English.

Check for:
- unrelated file edits
- old bright/yellow UI returning
- broken bottom navigation
- route changes
- AsyncStorage key changes
- implicit any TypeScript issues
- missing mobile/iPhone layout consideration
- changes that should be split into a separate branch

Useful commands:
- git branch --show-current
- git status --short
- git diff HEAD
- cd lit-app && npx tsc --noEmit

Then suggest:
1. a concise commit message
2. files Isaac should manually inspect
3. test commands to run
