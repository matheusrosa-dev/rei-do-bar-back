import { isExactPermutation } from "../permutation";

describe("Permutation Helpers", () => {
  describe("isExactPermutation", () => {
    it("should return true when the submitted ids are the existing ids in another order", () => {
      expect(
        isExactPermutation(["c", "a", "b"], new Set(["a", "b", "c"])),
      ).toBe(true);
    });

    it("should return true for two empty collections", () => {
      expect(isExactPermutation([], new Set<string>())).toBe(true);
    });

    it("should return false when an existing id is missing", () => {
      expect(isExactPermutation(["a", "b"], new Set(["a", "b", "c"]))).toBe(
        false,
      );
    });

    it("should return false when an unknown id is submitted", () => {
      expect(
        isExactPermutation(["a", "b", "d"], new Set(["a", "b", "c"])),
      ).toBe(false);
    });

    it("should return false when a submitted id is duplicated", () => {
      expect(
        isExactPermutation(["a", "b", "b"], new Set(["a", "b", "c"])),
      ).toBe(false);
    });

    it("should return false when more ids are submitted than exist", () => {
      expect(isExactPermutation(["a", "b", "c"], new Set(["a", "b"]))).toBe(
        false,
      );
    });
  });
});
