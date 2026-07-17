/** One 1-10 fulfillment rating collected right after completing Today's Quest — see the rating
 *  modal in app/(tabs)/index.tsx. Presentation/collection only: never blocks or duplicates the
 *  underlying step reward, which still flows through the existing completeQuestItem ledger. */
export type QuestFulfillmentFeedback = {
  /** Same id as the quest completion itself (HomeQuestItem.id) — reusing it is what makes a
   *  retry/resubmit of the same completion idempotent instead of creating a second rating. */
  completionId: string;
  questId: string;
  rating: number; // integer 1-10
  logicalDayKey: string;
  completedAt: string;
  userId: string;
  updatedAt: string;
};

export function isValidFulfillmentRating(rating: number): boolean {
  return Number.isInteger(rating) && rating >= 1 && rating <= 10;
}
