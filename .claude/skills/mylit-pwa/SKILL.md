---
name: mylit-pwa
description: Handle MYLIT PWA update, cache, icon, manifest, and version problems.
---

Use this for installed iPhone PWA update/cache issues.

Rules:
- Do not clear user progress.
- Do not clear AsyncStorage/localStorage.
- Update `lit-app/public/version.json` when visible app behavior changes.
- Verify manifest/icons/version after export:

cd /workspace/lit-app
npx expo export -p web
find dist -maxdepth 2 -type f | grep -E "manifest|icon|favicon|apple|version" || true

After deploy, test with:
https://mylit.net?fresh=<commit-hash>

If fresh deployment URL works but Home Screen app is stale, report that it is PWA cache and tell Isaac to open Safari at the fresh URL, wait, close, then reopen the Home Screen app.
