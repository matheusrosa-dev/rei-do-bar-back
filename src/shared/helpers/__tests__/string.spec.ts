import crypto from "node:crypto";
import { hashString, safeCompare } from "../string";

describe("String Helpers", () => {
  describe("hashString", () => {
    it("should return the SHA-256 hash of the input code", () => {
      const code = "ABC123";
      const expectedHash = crypto
        .createHash("sha256")
        .update(code)
        .digest("hex");

      const result = hashString(code);

      expect(result).toBe(expectedHash);
    });
  });

  describe("safeCompare", () => {
    it("should return true for equal strings", () => {
      expect(safeCompare("s3cr3t", "s3cr3t")).toBe(true);
    });

    it("should return false for different strings", () => {
      expect(safeCompare("s3cr3t", "wrong")).toBe(false);
    });

    it("should return false for strings of different lengths", () => {
      expect(safeCompare("abc", "abcdef")).toBe(false);
    });
  });
});
