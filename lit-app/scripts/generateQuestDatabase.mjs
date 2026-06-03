#!/usr/bin/env node
/**
 * ROG quest-database generator (build-time "training" step).
 *
 * Sibling of generateGoalDatabase.mjs. Run ON the ROG's network (Tailscale
 * 100.116.162.41) to (re)generate `constants/questDatabase.ts` — the offline
 * Quest Board data. Users never call the LLM; this is the only place it's used.
 *
 * Phase: **Progress mode.** Generates per-category Progress quests; Recovery is
 * preserved from the existing seed until migrated.
 *
 * Usage:
 *   node scripts/generateQuestDatabase.mjs
 *   OLLAMA_BASE_URL=http://100.116.162.41:11434 COUNT=5 \
 *   node scripts/generateQuestDatabase.mjs
 *
 * Every quest MUST contain the literal {goal} token; quests that come back
 * without it are patched. On any per-category failure the hand-authored seed is
 * kept, so a partial outage never empties the file.
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "constants", "questDatabase.ts");

const BASE_URL = (process.env.OLLAMA_BASE_URL || "http://100.116.162.41:11434").replace(/\/$/, "");
const MODEL = process.env.OLLAMA_MODEL || "qwen2.5:14b-instruct-q4_K_M";
const COUNT = Math.max(3, Number(process.env.COUNT || "5"));
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || "240000");

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

// Hand-authored Progress seeds — fallback when the model is unavailable.
const SEED = {
  Health: [
    "Do 25 minutes of intentional movement toward “{goal}.”",
    "Log everything you eat today to support “{goal}.”",
    "Hit your protein and water targets for “{goal}.”",
    "Push one workout slightly harder than yesterday for “{goal}.”",
    "Prep one healthy meal in advance for “{goal}.”",
  ],
  Money: [
    "Move a set amount into savings today toward “{goal}.”",
    "Spend 20 minutes building one income skill for “{goal}.”",
    "Cut or cancel one non-essential expense for “{goal}.”",
    "Review today's spending against “{goal}.”",
    "Take one concrete action on an income opportunity for “{goal}.”",
  ],
  Mind: [
    "Journal one focused page about “{goal}.”",
    "Do one 15-minute deep-work block on “{goal}.”",
    "Notice and reframe one limiting thought about “{goal}.”",
    "Read or learn something that advances “{goal}.”",
    "Plan tomorrow's top step for “{goal}.”",
  ],
  "Friends / Connection": [
    "Reach out to one person to move “{goal}” forward.",
    "Start one real conversation that serves “{goal}.”",
    "Make a concrete plan to meet someone for “{goal}.”",
    "Follow up with someone you owe a reply for “{goal}.”",
    "Do one intentional, kind act for a relationship in “{goal}.”",
  ],
  "School / Work": [
    "Finish one focused work block on “{goal}.”",
    "Do the single most important task for “{goal}” first.",
    "Make visible progress on your top “{goal}” project.",
    "Clear one blocker standing in the way of “{goal}.”",
    "Plan tomorrow's top three steps for “{goal}.”",
  ],
  Confidence: [
    "Do one slightly uncomfortable action toward “{goal}.”",
    "Keep a promise to yourself today for “{goal}.”",
    "Speak up once in service of “{goal}.”",
    "Write down one win you earned toward “{goal}.”",
    "Take initiative on one thing for “{goal}” without waiting.",
  ],
  Creativity: [
    "Spend 25 focused minutes creating toward “{goal}.”",
    "Ship or share one small piece for “{goal}.”",
    "Push one idea for “{goal}” from notes into a draft.",
    "Finish one rough section of your “{goal}” project.",
    "Study one craft technique that serves “{goal}.”",
  ],
  Sleep: [
    "Lock in your target bedtime tonight for “{goal}.”",
    "Start your wind-down 30 minutes early for “{goal}.”",
    "Cut screens an hour before bed to support “{goal}.”",
    "Keep the same wake time today for “{goal}.”",
    "Prep your room for better sleep toward “{goal}.”",
  ],
  "Phone Use": [
    "Hold one phone-free focus block for “{goal}.”",
    "Replace one scroll session with action on “{goal}.”",
    "Turn off one set of notifications to protect “{goal}.”",
    "Keep your phone out of reach during “{goal}” work.",
    "Track today's screen time against “{goal}.”",
  ],
  Purpose: [
    "Take one honest, concrete step toward “{goal}.”",
    "Spend 20 minutes on what matters most for “{goal}.”",
    "Align one decision today with “{goal}.”",
    "Review your progress and adjust toward “{goal}.”",
    "Say no to one thing that distracts from “{goal}.”",
  ],
};

const FALLBACK = [
  "Take one concrete step toward “{goal}” today.",
  "Spend 20 focused minutes on “{goal}.”",
  "Remove one obstacle in the way of “{goal}.”",
];

const SYSTEM_PROMPT =
  "You are Luna, a warm but concrete coach inside a sleep & productivity app. " +
  "You write DAILY quests for the Quest Board in PROGRESS mode (the user has energy " +
  "and wants to push forward). These render on small tiles, so each quest MUST be " +
  "SHORT: an imperative phrase starting with a verb, MAX 12 words, ONE sentence, no " +
  "preamble, no numbered lists, no extra explanation. Ambitious but realistic. " +
  "CRITICAL: every quest must contain the user's goal wrapped EXACTLY as “{goal}” " +
  "(curly quotes + literal braces); do NOT invent a concrete goal yourself. " +
  "Example: Do 25 minutes of focused movement toward “{goal}.”";

const SCHEMA = {
  type: "object",
  properties: {
    quests: { type: "array", items: { type: "string" } },
  },
  required: ["quests"],
};

function ensureSlot(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  let t = text.trim().replace(/\s+/g, " ");
  // Normalize stray double punctuation the model sometimes emits (e.g. "..").
  t = t.replace(/([.!?])\1+/g, "$1");
  if (!t.includes("{goal}")) {
    t = t.replace(/[.!]?\s*$/, "") + " toward “{goal}.”";
  }
  return t;
}

function sanitize(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const q of raw) {
    const fixed = ensureSlot(q);
    if (fixed && !seen.has(fixed)) {
      seen.add(fixed);
      out.push(fixed);
    }
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
              `Category: ${category}. Produce ${COUNT} distinct Progress-mode daily quests as a ` +
              `JSON array under "quests". Each must include the literal {goal} token.`,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const parsed = JSON.parse(data?.message?.content ?? "{}");
    const quests = sanitize(parsed?.quests).slice(0, COUNT);
    if (quests.length < 3) throw new Error("too few usable quests");
    return quests;
  } finally {
    clearTimeout(timer);
  }
}

function tsLiteral(value) {
  return JSON.stringify(value);
}

function serializeList(list) {
  return list.map((q) => `      ${tsLiteral(q)},`).join("\n");
}

function renderFile(db) {
  const entries = CATEGORIES.map(
    (c) => `  ${tsLiteral(c)}: {\n    progress: [\n${serializeList(db[c])}\n    ],\n  },`
  ).join("\n");

  return `/**
 * Offline quest database.
 *
 * GENERATED by scripts/generateQuestDatabase.mjs using the ROG Ollama model.
 * Each category holds daily quests per mode, with a {goal} slot substituted with
 * the user's specific goal at runtime. The app never calls the LLM — the ROG is
 * a build-time data factory and users run entirely offline against this file.
 *
 * Phase: Progress mode. Recovery quests still come from the inline map in
 * (tabs)/index.tsx until migrated.
 *
 * To regenerate: run \`node scripts/generateQuestDatabase.mjs\` on the ROG network.
 * Last generated: ${new Date().toISOString()}
 */

export type QuestMode = "progress" | "recovery";

export type CategoryQuests = {
  progress: string[];
  recovery?: string[];
};

export const QUEST_DATABASE: Record<string, CategoryQuests> = {
${entries}
};

export const QUEST_DATABASE_FALLBACK: CategoryQuests = {
  progress: [
${serializeList(FALLBACK)}
  ],
};
`;
}

async function main() {
  console.log(`[quest-db] model=${MODEL} base=${BASE_URL} count=${COUNT}`);
  const db = {};
  for (const category of CATEGORIES) {
    process.stdout.write(`[quest-db] ${category} … `);
    try {
      db[category] = await generateCategory(category);
      console.log(`ok (${db[category].length})`);
    } catch (err) {
      db[category] = SEED[category] ?? FALLBACK;
      console.log(`FAILED (${err.message}) — kept seed`);
    }
  }

  await writeFile(OUT_PATH, renderFile(db), "utf8");
  console.log(`[quest-db] wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("[quest-db] fatal:", err);
  process.exit(1);
});
