#!/usr/bin/env node
/**
 * ROG goal-database generator (build-time "training" step).
 *
 * Run this ON the ROG's network while Ollama is serving. It calls the local
 * model to (re)generate `constants/goalDatabase.ts` — the offline database the
 * app ships with. Users never call the LLM; this script is the only place the
 * model is used.
 *
 * Usage:
 *   node scripts/generateGoalDatabase.mjs
 *   OLLAMA_BASE_URL=http://10.145.163.105:11434 \
 *   OLLAMA_MODEL=qwen2.5:14b-instruct-q4_K_M \
 *   VARIANTS=3 node scripts/generateGoalDatabase.mjs
 *
 * Notes:
 *   - Each milestone MUST contain the literal token {goal}; the app substitutes
 *     it with the user's typed specific goal at runtime. Variants that come back
 *     without the slot are patched so the database stays personalizable.
 *   - On any per-category failure the existing hand-authored seed for that
 *     category is kept, so a partial ROG outage never produces an empty file.
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "constants", "goalDatabase.ts");

const BASE_URL = (process.env.OLLAMA_BASE_URL || "http://10.145.163.105:11434").replace(/\/$/, "");
const MODEL = process.env.OLLAMA_MODEL || "qwen2.5:14b-instruct-q4_K_M";
const VARIANTS = Math.max(1, Number(process.env.VARIANTS || "2"));
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || "60000");

const CATEGORIES = [
  "Health",
  "Money",
  "Mind",
  "Friends / Connection",
  "School / Work",
  "Confidence",
  "Creativity",
  "Sleep",
  "Phone Use",
  "Purpose",
];

// Hand-authored seeds: used as the fallback whenever the model is unavailable
// or returns something unusable for a category.
const SEED = {
  Health: [
    {
      shortTerm: "This week, move your body 20 minutes a day, 4 days — your first visible step toward “{goal}.”",
      midTerm: "Hold a steady weekly movement rhythm for 8 weeks so “{goal}” stops feeling fragile.",
      longTerm: "Make “{goal}” part of an everyday body you trust — movement, sleep, and meals on autopilot.",
    },
  ],
  Money: [
    {
      shortTerm: "Track every dollar honestly for two weeks to see exactly where “{goal}” stands today.",
      midTerm: "Build one real cushion over 1–3 months that moves you toward “{goal}.”",
      longTerm: "Reach “{goal}” and a stable floor beneath it — savings, one income skill, no avoidance.",
    },
  ],
  Mind: [
    {
      shortTerm: "Journal one honest sentence a day for two weeks about “{goal}.”",
      midTerm: "Name three recurring patterns over the next quarter that pull you away from “{goal}.”",
      longTerm: "Build a steady inner voice that keeps “{goal}” in view — daily reflection, weekly review.",
    },
  ],
  "Friends / Connection": [
    {
      shortTerm: "Reach out to one person this week as a first move toward “{goal}.”",
      midTerm: "Have three real conversations over the next two months that build “{goal}.”",
      longTerm: "Grow relationships you can show up honestly in — “{goal}” as a lasting part of life.",
    },
  ],
  "School / Work": [
    {
      shortTerm: "Complete one focused work block every weekday for two weeks toward “{goal}.”",
      midTerm: "Ship one meaningful milestone for “{goal}” within the next eight weeks.",
      longTerm: "Become someone who reliably finishes — “{goal}” delivered, with steady output.",
    },
  ],
  Confidence: [
    {
      shortTerm: "Keep one small daily promise to yourself for two weeks that points at “{goal}.”",
      midTerm: "Step into three uncomfortable moments over two months in service of “{goal}.”",
      longTerm: "Trust yourself by default on “{goal}” — built on evidence, not affirmation.",
    },
  ],
  Creativity: [
    {
      shortTerm: "Create something small for 20 minutes a day for two weeks toward “{goal}.”",
      midTerm: "Finish and share one piece tied to “{goal}” within two months.",
      longTerm: "Make “{goal}” part of who you are — a creative practice you don't wait for.",
    },
  ],
  Sleep: [
    {
      shortTerm: "Set and protect a realistic bedtime for two weeks as your base for “{goal}.”",
      midTerm: "Stabilize a sleep rhythm over 1–3 months that supports “{goal}.”",
      longTerm: "Treat sleep as the foundation of “{goal}” — consistent, intentional, undefended.",
    },
  ],
  "Phone Use": [
    {
      shortTerm: "Hold one phone-free hour daily for two weeks to create room for “{goal}.”",
      midTerm: "Cut daily screen time by a real margin over 1–3 months toward “{goal}.”",
      longTerm: "Use your phone on purpose so it serves “{goal}” instead of stealing from it.",
    },
  ],
  Purpose: [
    {
      shortTerm: "Take one honest step this week toward “{goal}.”",
      midTerm: "Build a weekly review habit over 1–3 months that keeps “{goal}” in sight.",
      longTerm: "Live a life you'd be proud to describe, with “{goal}” at its center.",
    },
  ],
};

const FALLBACK = [
  {
    shortTerm: "Take one concrete step this week toward “{goal}.”",
    midTerm: "Build one supporting habit over the next 1–3 months for “{goal}.”",
    longTerm: "Live in alignment with “{goal}” — steady action and honest reflection.",
  },
];

const SYSTEM_PROMPT =
  "You are Luna, a warm but concrete coach inside a sleep & productivity app. " +
  "You write milestone templates for a goal-setting feature. Each milestone is ONE " +
  "encouraging, concrete sentence. CRITICAL: every milestone must contain the literal " +
  "token {goal} (with the braces) exactly where the user's specific goal should be " +
  "inserted at runtime — do NOT invent a concrete goal yourself. Prefer wrapping it as " +
  "“{goal}”. shortTerm = next 1–2 weeks, midTerm = next 1–3 months, longTerm = next 6–12 months.";

const SCHEMA = {
  type: "object",
  properties: {
    variants: {
      type: "array",
      items: {
        type: "object",
        properties: {
          shortTerm: { type: "string" },
          midTerm: { type: "string" },
          longTerm: { type: "string" },
        },
        required: ["shortTerm", "midTerm", "longTerm"],
      },
    },
  },
  required: ["variants"],
};

function ensureSlot(text, horizon) {
  if (typeof text !== "string" || !text.trim()) return null;
  if (text.includes("{goal}")) return text.trim();
  // Model dropped the slot — append it so the entry stays personalizable.
  const suffix =
    horizon === "shortTerm"
      ? " toward “{goal}.”"
      : horizon === "midTerm"
        ? " in service of “{goal}.”"
        : " so “{goal}” becomes who you are.";
  return text.trim().replace(/[.!]?\s*$/, "") + suffix;
}

function sanitizeVariants(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const v of raw) {
    const shortTerm = ensureSlot(v?.shortTerm, "shortTerm");
    const midTerm = ensureSlot(v?.midTerm, "midTerm");
    const longTerm = ensureSlot(v?.longTerm, "longTerm");
    if (shortTerm && midTerm && longTerm) out.push({ shortTerm, midTerm, longTerm });
  }
  return out;
}

async function generateCategory(category) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        format: SCHEMA,
        options: { temperature: 0.8 },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content:
              `Category: ${category}. Produce ${VARIANTS} distinct milestone variants as JSON ` +
              `under "variants". Each variant has shortTerm, midTerm, longTerm. Remember: every ` +
              `sentence must include the literal {goal} token.`,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const parsed = JSON.parse(data?.message?.content ?? "{}");
    const variants = sanitizeVariants(parsed?.variants);
    if (variants.length === 0) throw new Error("no usable variants");
    return variants;
  } finally {
    clearTimeout(timer);
  }
}

function tsLiteral(value) {
  // JSON string syntax is a valid TS double-quoted string literal.
  return JSON.stringify(value);
}

function serializeVariants(variants) {
  return variants
    .map(
      (v) =>
        `    {\n` +
        `      shortTerm: ${tsLiteral(v.shortTerm)},\n` +
        `      midTerm: ${tsLiteral(v.midTerm)},\n` +
        `      longTerm: ${tsLiteral(v.longTerm)},\n` +
        `    },`
    )
    .join("\n");
}

function renderFile(db) {
  const entries = CATEGORIES.map(
    (c) => `  ${tsLiteral(c)}: [\n${serializeVariants(db[c])}\n  ],`
  ).join("\n");

  return `/**
 * Offline goal database.
 *
 * GENERATED by scripts/generateGoalDatabase.mjs using the ROG Ollama model.
 * Each category holds milestone variants with a {goal} slot, substituted with
 * the user's specific goal at runtime. The app never calls the LLM — the ROG is
 * a build-time data factory and users run entirely offline against this file.
 *
 * To regenerate: run \`node scripts/generateGoalDatabase.mjs\` on the ROG network.
 * Last generated: ${new Date().toISOString()}
 */

import type { GoalMilestoneSet } from "./goalMilestoneTemplates";

/** Placeholder substituted with the user's specific goal at runtime. */
export const GOAL_SLOT = "{goal}";

/** Used when the user has not typed a specific goal yet. */
export const DEFAULT_GOAL_PHRASE = "your goal";

export const GOAL_DATABASE: Record<string, GoalMilestoneSet[]> = {
${entries}
};

export const GOAL_DATABASE_FALLBACK: GoalMilestoneSet[] = [
${serializeVariants(FALLBACK)}
];
`;
}

async function main() {
  console.log(`[goal-db] model=${MODEL} base=${BASE_URL} variants=${VARIANTS}`);
  const db = {};
  for (const category of CATEGORIES) {
    process.stdout.write(`[goal-db] ${category} … `);
    try {
      db[category] = await generateCategory(category);
      console.log(`ok (${db[category].length})`);
    } catch (err) {
      db[category] = SEED[category] ?? FALLBACK;
      console.log(`FAILED (${err.message}) — kept seed`);
    }
  }

  await writeFile(OUT_PATH, renderFile(db), "utf8");
  console.log(`[goal-db] wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("[goal-db] fatal:", err);
  process.exit(1);
});
