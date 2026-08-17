import { hashString } from "../string";
import { generateOpaqueToken } from "../opaque-token";

describe("Opaque Token Helpers", () => {
  describe("generateOpaqueToken", () => {
    it("should return an object with token and hashedToken properties", () => {
      const result = generateOpaqueToken();

      expect(result).toEqual({
        token: expect.any(String),
        hashedToken: expect.any(String),
      });
    });

    it("should encode 32 random bytes as base64url", () => {
      const { token } = generateOpaqueToken();

      expect(token).toHaveLength(43); // 32 bytes in base64 without padding
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/); // base64url alphabet only
    });

    it("should hash the token with the shared string helper", () => {
      const { token, hashedToken } = generateOpaqueToken();

      expect(hashedToken).toBe(hashString(token));
      expect(hashedToken).toHaveLength(64); // SHA-256 hash length in hexadecimal
    });

    it("should generate a different token on every call", () => {
      const first = generateOpaqueToken();
      const second = generateOpaqueToken();

      expect(first.token).not.toBe(second.token);
      expect(first.hashedToken).not.toBe(second.hashedToken);
    });
  });
});
