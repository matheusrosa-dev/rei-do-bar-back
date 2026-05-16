import { generateOtpCode } from "../otp-code";

describe("Otp Code Helpers", () => {
  describe("generateOtpCode", () => {
    it("should generate a 6-digit code and return an object with hashedCode and code properties", () => {
      const result = generateOtpCode();

      expect(result).toEqual({
        hashedCode: expect.any(String),
        code: expect.any(String),
      });

      expect(result.hashedCode).toHaveLength(64); // SHA-256 hash length in hexadecimal
    });
  });
});
