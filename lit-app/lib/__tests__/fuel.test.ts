import {
  computeFirstLastMealForDay,
  computeFuel,
  computeMealPatternInsight,
  computePersonalizedFuelInterval,
  DEFAULT_FUEL_INTERVAL_MINUTES,
  FOOD_GATE_FUEL_THRESHOLD,
  fuelStatusForValue,
  isDuplicateFoodLog,
  MAX_FUEL_INTERVAL_MINUTES,
  MIN_FUEL_INTERVAL_MINUTES,
  type FoodLog,
} from "../fuel";

function meal(eatenAt: string, id = `meal-${eatenAt}`): FoodLog {
  return { id, userId: "u1", eatenAt, entryType: "meal", logicalDayKey: eatenAt.slice(0, 10), createdAt: eatenAt, updatedAt: eatenAt };
}
function snack(eatenAt: string, id = `snack-${eatenAt}`): FoodLog {
  return { id, userId: "u1", eatenAt, entryType: "snack", logicalDayKey: eatenAt.slice(0, 10), createdAt: eatenAt, updatedAt: eatenAt };
}

describe("fuel derivation", () => {
  it("with no logs, fuel is full (100, Fueled)", () => {
    const result = computeFuel([], new Date("2026-07-10T12:00:00Z"));
    expect(result.fuel).toBe(100);
    expect(result.status).toBe("Fueled");
  });

  it("a meal restores fuel to 100 at the moment it's logged", () => {
    const result = computeFuel([meal("2026-07-10T12:00:00Z")], new Date("2026-07-10T12:00:00Z"));
    expect(result.fuel).toBe(100);
  });

  it("fuel decays linearly toward 0 over the interval", () => {
    const eatenAt = "2026-07-10T12:00:00Z";
    const halfway = new Date(new Date(eatenAt).getTime() + (DEFAULT_FUEL_INTERVAL_MINUTES / 2) * 60000);
    const result = computeFuel([meal(eatenAt)], halfway);
    expect(result.fuel).toBeGreaterThanOrEqual(48);
    expect(result.fuel).toBeLessThanOrEqual(52);
  });

  it("fuel never goes below 0 even long after the interval elapses", () => {
    const eatenAt = "2026-07-10T12:00:00Z";
    const wayLater = new Date(new Date(eatenAt).getTime() + 20 * 60 * 60000);
    const result = computeFuel([meal(eatenAt)], wayLater);
    expect(result.fuel).toBe(0);
    expect(result.status).toBe("Time to Eat");
  });

  it("a snack adds 35, capped at 100", () => {
    const at100 = computeFuel([meal("2026-07-10T12:00:00Z"), snack("2026-07-10T12:05:00Z")], new Date("2026-07-10T12:05:00Z"));
    expect(at100.fuel).toBe(100);

    // Snack logged after fuel has already decayed below 65 should land below the 100 cap.
    const decayedAt = new Date(new Date("2026-07-10T12:00:00Z").getTime() + (DEFAULT_FUEL_INTERVAL_MINUTES * 0.8) * 60000).toISOString();
    const withDecay = computeFuel([meal("2026-07-10T12:00:00Z"), snack(decayedAt)], new Date(decayedAt));
    expect(withDecay.fuel).toBeLessThan(100);
    expect(withDecay.fuel).toBeGreaterThan(20);
  });

  it("fuel derives identically regardless of when it's read (reload/foreground/another device)", () => {
    const logs = [meal("2026-07-10T08:00:00Z"), snack("2026-07-10T11:00:00Z")];
    const readNow = new Date("2026-07-10T13:00:00Z");
    const first = computeFuel(logs, readNow);
    const second = computeFuel([...logs], new Date(readNow.getTime()));
    expect(first.fuel).toBe(second.fuel);
  });
});

describe("fuel status thresholds", () => {
  it("maps value ranges to the correct status", () => {
    expect(fuelStatusForValue(100)).toBe("Fueled");
    expect(fuelStatusForValue(60)).toBe("Fueled");
    expect(fuelStatusForValue(59)).toBe("Running Low");
    expect(fuelStatusForValue(30)).toBe("Running Low");
    expect(fuelStatusForValue(29)).toBe("Time to Eat");
    expect(fuelStatusForValue(0)).toBe("Time to Eat");
  });

  it("the food gate threshold (29) is the top of the Time to Eat band", () => {
    expect(fuelStatusForValue(FOOD_GATE_FUEL_THRESHOLD)).toBe("Time to Eat");
    expect(fuelStatusForValue(FOOD_GATE_FUEL_THRESHOLD + 1)).toBe("Running Low");
  });
});

describe("personalized interval learning + clamping", () => {
  it("uses the default interval with fewer than 7 valid meal intervals", () => {
    const logs = [meal("2026-07-01T08:00:00Z"), meal("2026-07-01T13:00:00Z"), meal("2026-07-01T19:00:00Z")];
    expect(computePersonalizedFuelInterval(logs)).toBe(DEFAULT_FUEL_INTERVAL_MINUTES);
  });

  it("personalizes once 7+ valid intervals exist, clamped to [240, 360]", () => {
    // 8 meals, ~200 minutes apart (below the 240 floor) -> should clamp up to 240.
    const logs: FoodLog[] = [];
    let t = new Date("2026-07-01T08:00:00Z").getTime();
    for (let i = 0; i < 8; i += 1) {
      logs.push(meal(new Date(t).toISOString(), `m${i}`));
      t += 200 * 60000;
    }
    const interval = computePersonalizedFuelInterval(logs);
    expect(interval).toBe(MIN_FUEL_INTERVAL_MINUTES);
  });

  it("clamps an unrealistically long learned interval to 360", () => {
    const logs: FoodLog[] = [];
    let t = new Date("2026-07-01T08:00:00Z").getTime();
    for (let i = 0; i < 8; i += 1) {
      logs.push(meal(new Date(t).toISOString(), `m${i}`));
      t += 500 * 60000; // 500 min apart, still under the 20h implausibility cutoff
    }
    expect(computePersonalizedFuelInterval(logs)).toBe(MAX_FUEL_INTERVAL_MINUTES);
  });

  it("ignores implausible intervals (too short or too long) when learning", () => {
    const logs = [
      meal("2026-07-01T08:00:00Z", "a"),
      meal("2026-07-01T08:10:00Z", "b"), // 10 min later -- implausible, dropped
      meal("2026-07-02T08:00:00Z", "c"), // ~24h later -- implausible, dropped
      meal("2026-07-03T08:00:00Z", "d"),
      meal("2026-07-03T13:00:00Z", "e"),
      meal("2026-07-04T08:00:00Z", "f"),
      meal("2026-07-04T13:00:00Z", "g"),
      meal("2026-07-05T08:00:00Z", "h"),
      meal("2026-07-05T13:00:00Z", "i"),
    ];
    // Only the plausible ~300min gaps should count; still fewer than 7 valid ones here.
    expect(computePersonalizedFuelInterval(logs)).toBe(DEFAULT_FUEL_INTERVAL_MINUTES);
  });
});

describe("duplicate food log detection", () => {
  it("flags a same-type log within 5 minutes of an existing one", () => {
    const logs = [meal("2026-07-10T12:00:00Z")];
    expect(isDuplicateFoodLog(logs, { eatenAt: "2026-07-10T12:02:00Z", entryType: "meal" })).toBe(true);
  });

  it("does not flag a different entry type at the same time", () => {
    const logs = [meal("2026-07-10T12:00:00Z")];
    expect(isDuplicateFoodLog(logs, { eatenAt: "2026-07-10T12:02:00Z", entryType: "snack" })).toBe(false);
  });

  it("does not flag a log far enough away in time", () => {
    const logs = [meal("2026-07-10T12:00:00Z")];
    expect(isDuplicateFoodLog(logs, { eatenAt: "2026-07-10T13:00:00Z", entryType: "meal" })).toBe(false);
  });
});

describe("first/last meal derivation", () => {
  it("derives first and last meal for a logical day from meal logs only", () => {
    const logs = [
      meal("2026-07-10T08:00:00Z"),
      snack("2026-07-10T10:00:00Z"),
      meal("2026-07-10T13:00:00Z"),
      meal("2026-07-10T19:00:00Z"),
      meal("2026-07-11T08:00:00Z"),
    ];
    const result = computeFirstLastMealForDay(logs, "2026-07-10");
    expect(result.firstMealAt).toBe("2026-07-10T08:00:00Z");
    expect(result.lastMealAt).toBe("2026-07-10T19:00:00Z");
  });

  it("returns nulls for a day with no meals", () => {
    const result = computeFirstLastMealForDay([meal("2026-07-10T08:00:00Z")], "2026-07-11");
    expect(result.firstMealAt).toBeNull();
    expect(result.lastMealAt).toBeNull();
  });
});

describe("meal pattern insight for Luna's sleep-timing suggestion", () => {
  it("requires at least 7 valid days before returning a pattern", () => {
    const logs = [meal("2026-07-01T08:00:00Z"), meal("2026-07-02T08:00:00Z")];
    const insight = computeMealPatternInsight(logs);
    expect(insight.medianFirstMealMinutes).toBeNull();
    expect(insight.medianLastMealMinutes).toBeNull();
  });

  it("computes a median first/last meal time across 7+ days", () => {
    const logs: FoodLog[] = [];
    for (let day = 1; day <= 7; day += 1) {
      const d = String(day).padStart(2, "0");
      logs.push(meal(`2026-07-${d}T08:00:00Z`, `first-${d}`));
      logs.push(meal(`2026-07-${d}T19:00:00Z`, `last-${d}`));
    }
    const insight = computeMealPatternInsight(logs);
    expect(insight.medianFirstMealMinutes).toBe(8 * 60);
    expect(insight.medianLastMealMinutes).toBe(19 * 60);
    expect(insight.validDayCount).toBe(7);
  });
});
