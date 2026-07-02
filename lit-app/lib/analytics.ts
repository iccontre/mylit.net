import { getSession } from "./auth";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";

export const ANALYTICS_EVENTS = {
  signup_completed: "signup_completed",
  onboarding_completed: "onboarding_completed",
  morning_checkin_completed: "morning_checkin_completed",
  afternoon_checkin_completed: "afternoon_checkin_completed",
  quest_started: "quest_started",
  quest_completed: "quest_completed",
  quest_missed: "quest_missed",
  day_plan_saved: "day_plan_saved",
  quick_thought_saved: "quick_thought_saved",
  sleep_guide_saved: "sleep_guide_saved",
  stats_opened: "stats_opened",
  calendar_opened: "calendar_opened",
  feedback_submitted: "feedback_submitted",
  waiting_room_opened: "waiting_room_opened",
  waiting_room_boost_used: "waiting_room_boost_used",
  waiting_room_completed: "waiting_room_completed",
  waiting_room_missed: "waiting_room_missed",
} as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

async function getAuthenticatedUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const session = await getSession();
  return session?.user?.id ?? null;
}

export async function trackEvent(
  eventName: AnalyticsEventName | string,
  eventData: Record<string, unknown> = {}
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const userId = await getAuthenticatedUserId();
    if (!supabase || !userId) return;

    const { error } = await supabase.from("app_events").insert({
      user_id: userId,
      event_name: eventName,
      event_data: eventData,
    });

    if (error) {
      console.warn("trackEvent failed:", error.message);
    }
  } catch (error) {
    console.warn("trackEvent error:", error);
  }
}

export async function submitFeedback(page: string, rating: number, message: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const userId = await getAuthenticatedUserId();
    if (!supabase || !userId) return;

    const { error } = await supabase.from("feedback").insert({
      user_id: userId,
      page: page.trim() || null,
      rating: Number.isFinite(rating) ? Math.round(rating) : null,
      message: message.trim() || null,
    });

    if (error) {
      console.warn("submitFeedback failed:", error.message);
      return;
    }

    void trackEvent(ANALYTICS_EVENTS.feedback_submitted, { page, rating });
  } catch (error) {
    console.warn("submitFeedback error:", error);
  }
}
