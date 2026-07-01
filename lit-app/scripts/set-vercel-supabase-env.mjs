import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const envText = readFileSync(".env.local", "utf8");
const url = (envText.match(/^EXPO_PUBLIC_SUPABASE_URL=(.*)$/m) || [])[1]?.trim();
const key = (envText.match(/^EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)$/m) || [])[1]?.trim();

if (!url || !key) {
  console.error("Missing EXPO_PUBLIC_SUPABASE_* values in .env.local");
  process.exit(1);
}

function run(args) {
  const result = spawnSync("npx", ["--yes", "vercel@latest", ...args], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const msg = `${result.stdout || ""}${result.stderr || ""}`;
    if (!msg.includes("env_not_found") && !msg.includes("was not found")) {
      console.error(msg.trim());
      process.exit(result.status || 1);
    }
  }
}

const targets = ["production", "preview"];
const names = ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"];
const values = { EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: key };

for (const target of targets) {
  for (const name of names) {
    run(["env", "rm", name, target, "--yes"]);
  }
}

for (const target of targets) {
  for (const name of names) {
    const result = spawnSync(
      "npx",
      [
        "--yes",
        "vercel@latest",
        "env",
        "add",
        name,
        target,
        "--value",
        values[name],
        "--no-sensitive",
        "--yes",
      ],
      {
        cwd: new URL("..", import.meta.url).pathname,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    if (result.status !== 0) {
      console.error(`failed ${name} on ${target}:`, (result.stderr || result.stdout).trim());
      process.exit(result.status || 1);
    }
    console.log(`set ${name} on ${target}`);
  }
}
