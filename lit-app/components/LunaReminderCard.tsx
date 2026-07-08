import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { isReminderActiveNow, isReminderScheduledForDay, type LunaDayReminder } from "../lib/lunaReminders";
import type { WeekdayName } from "../lib/scheduling";
import { LUNA_DAY_REMINDERS_KEY } from "../lib/storageKeys";

const pixelFont = "monospace";

const ROTATING_REMINDERS = [
  "Drink some water.",
  "You're making progress no matter what.",
  "Small steps still count as steps.",
  "Take a breath — you're doing better than you think.",
  "Rest is part of the plan, not a break from it.",
];

const HOBBY_REMINDERS = [
  "Make a little time for something you actually enjoy today.",
  "Your hobby counts too — it's not wasted time.",
  "Self-care isn't a reward you have to earn first.",
];

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Rotates by minute-of-day so it feels alive without needing a timer/interval. */
function pickRotating(pool: string[]): string {
  const minuteOfDay = new Date().getHours() * 60 + new Date().getMinutes();
  return pool[minuteOfDay % pool.length];
}

/**
 * Display-only — creation moved to the Home/Path guide popup's "Set Reminder" (see
 * LunaGuideModal). This card only surfaces the rotating built-in message or an active
 * user-created reminder for the selected day.
 */
export function LunaReminderCard({ selectedDay, selectedDateKey }: { selectedDay: WeekdayName; selectedDateKey: string }) {
  const [reminders, setReminders] = useState<LunaDayReminder[]>([]);

  useEffect(() => {
    void readJson<LunaDayReminder[]>(LUNA_DAY_REMINDERS_KEY, []).then(setReminders);
  }, [selectedDateKey]);

  const activeUserReminder = useMemo(() => {
    const forDay = reminders.filter((r) => isReminderScheduledForDay(r, selectedDay, selectedDateKey));
    return forDay.find(isReminderActiveNow) ?? null;
  }, [reminders, selectedDay, selectedDateKey]);

  // Hobby/self-care reminders take most of the day (per spec) unless a user reminder is active.
  const displayedText = activeUserReminder
    ? activeUserReminder.text
    : new Date().getMinutes() % 3 === 0
      ? pickRotating(ROTATING_REMINDERS)
      : pickRotating(HOBBY_REMINDERS);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>REMINDER FROM LUNA</Text>
      <Text style={styles.text}>{displayedText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(253, 242, 248, 0.12)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#F472B6",
  },
  label: { color: "#F9A8D4", fontFamily: pixelFont, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginBottom: 5 },
  text: { color: "#FCE7F3", fontSize: 13, lineHeight: 18, fontWeight: "700" },
});
