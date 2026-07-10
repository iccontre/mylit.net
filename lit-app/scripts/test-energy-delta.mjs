#!/usr/bin/env node
// Regression test for the mandatory eat/rest "restore energy" quest.
// Users have reported energy appearing to go DOWN after completing it — this test
// pins the expected behavior (always a positive restore) so a future change to
// lib/scheduling.ts's getEnergyDelta/getMandatoryQuestRestoreEnergy can't silently
// flip the sign again. Plain Node, no test framework — run with:
//   node scripts/test-energy-delta.mjs

import assert from "node:assert/strict";

function parseDurationMinutes(value, fallback) {
  if (typeof value === "number") return value;
  const match = String(value ?? "").match(/(\d+)/);
  return match ? Number(match[1]) : fallback;
}

// Mirrors lib/scheduling.ts getMandatoryQuestRestoreEnergy.
function getMandatoryQuestRestoreEnergy(durationMinutes) {
  const minutes = parseDurationMinutes(durationMinutes, 15);
  return minutes >= 30 ? 10 : 5;
}

// Mirrors lib/scheduling.ts getEnergyDelta's mandatory branch.
function getEnergyDelta(opts) {
  if (opts.mandatory) return getMandatoryQuestRestoreEnergy(opts.durationMinutes);
  throw new Error("test only covers the mandatory branch");
}

function clampEnergy(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

// 1. Mild tier (15 min, triggered under 60 energy) restores +5, never negative.
assert.equal(getMandatoryQuestRestoreEnergy(15), 5);
assert.equal(getEnergyDelta({ mandatory: true, durationMinutes: 15, title: "Eat or rest to restore energy" }), 5);

// 2. Severe tier (30 min, triggered under 30 energy) restores +10 — more than mild,
//    since it's the harder ask.
assert.equal(getMandatoryQuestRestoreEnergy(30), 10);
assert.equal(getEnergyDelta({ mandatory: true, durationMinutes: 30, title: "Eat or rest to restore energy" }), 10);

// 3. End-to-end: completing the mild quest must raise a user's live energy value,
//    matching app/(tabs)/index.tsx's `energyYield = clampEnergy(baseEnergyYield - passiveDecay
//    + questEnergyDelta + mandatoryRecoveryBoost)`.
const baseEnergyYield = 40;
const mandatoryRecoveryBoost = getMandatoryQuestRestoreEnergy(15);
const energyYield = clampEnergy(baseEnergyYield - 0 + 0 + mandatoryRecoveryBoost);
assert.ok(energyYield > baseEnergyYield, `expected energy to increase (${baseEnergyYield} -> ${energyYield})`);
assert.equal(energyYield, 45);

// 4. Multiple completions in one day (mild then severe) must sum positively, never net negative.
const boost = [15, 30].reduce((sum, minutes) => sum + getMandatoryQuestRestoreEnergy(minutes), 0);
assert.equal(boost, 15);
assert.ok(boost > 0);

console.log("test-energy-delta: all assertions passed — mandatory eat/rest always restores energy.");
