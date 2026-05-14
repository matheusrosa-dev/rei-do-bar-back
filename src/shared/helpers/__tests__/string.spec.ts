import crypto from "node:crypto";
import { hashString } from "../string";

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
});
