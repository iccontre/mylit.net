---
name: mylit-ship
description: Test, commit, push to main, and deploy the MYLIT production app safely.
---

Use this skill when work is ready to ship.

Run:
cd /workspace
git checkout main
git status

Verify remote is SSH:
git remote -v

If origin is not `git@github.com:iccontre/mylit.net.git`, fix it:
git remote remove origin || true
git remote add origin git@github.com:iccontre/mylit.net.git
git remote set-url --push origin git@github.com:iccontre/mylit.net.git

Run tests:
cd /workspace/lit-app
npx tsc --noEmit
npx expo export -p web

If tests fail, fix before committing.

Commit:
cd /workspace
git status
git add .
git reset -- .env .env.local .vercel lit-app/.env lit-app/.env.local lit-app/.vercel || true
git status
git commit -m "Update MYLIT app"

Push:
GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_mylit -o IdentitiesOnly=yes" git push origin main

Deploy:
cd /workspace/lit-app
npx --yes vercel@latest --prod --yes

Final report:
- commit hash
- push status
- production URL
- whether https://mylit.net was aliased
- what Isaac should test
