import { hashPassword, verifyPassword } from "../password";

const PASSWORD = "senha-do-entregador";

describe("Password Helpers", () => {
  describe("hashPassword", () => {
    it("should never return the plaintext password", async () => {
      const hashedPassword = await hashPassword(PASSWORD);

      expect(hashedPassword).not.toBe(PASSWORD);
      expect(hashedPassword).not.toContain(PASSWORD);
    });

    it("should produce a different hash for the same password", async () => {
      const [first, second] = await Promise.all([
        hashPassword(PASSWORD),
        hashPassword(PASSWORD),
      ]);

      expect(first).not.toBe(second); // salted
    });
  });

  describe("verifyPassword", () => {
    it("should accept the password that produced the hash", async () => {
      const hashedPassword = await hashPassword(PASSWORD);

      await expect(verifyPassword(PASSWORD, hashedPassword)).resolves.toBe(
        true,
      );
    });

    it("should reject a wrong password", async () => {
      const hashedPassword = await hashPassword(PASSWORD);

      await expect(
        verifyPassword("senha-errada", hashedPassword),
      ).resolves.toBe(false);
    });
  });
});
