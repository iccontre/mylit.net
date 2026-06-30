import { readFileSync, writeFileSync } from "node:fs";

const app = JSON.parse(readFileSync("app.json", "utf8"));
const payload = {
  version: app.expo?.version ?? "1.0.0",
  builtAt: new Date().toISOString(),
};

writeFileSync("public/version.json", `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote public/version.json (${payload.version} @ ${payload.builtAt})`);
