import { isValidFulfillmentRating } from "../questFulfillment";

describe("isValidFulfillmentRating", () => {
  it("accepts every integer from 1 to 10", () => {
    for (let i = 1; i <= 10; i++) {
      expect(isValidFulfillmentRating(i)).toBe(true);
    }
  });

  it("rejects 0 and 11 (out of range)", () => {
    expect(isValidFulfillmentRating(0)).toBe(false);
    expect(isValidFulfillmentRating(11)).toBe(false);
  });

  it("rejects non-integers", () => {
    expect(isValidFulfillmentRating(5.5)).toBe(false);
  });

  it("rejects negative numbers and NaN", () => {
    expect(isValidFulfillmentRating(-1)).toBe(false);
    expect(isValidFulfillmentRating(NaN)).toBe(false);
  });
});
