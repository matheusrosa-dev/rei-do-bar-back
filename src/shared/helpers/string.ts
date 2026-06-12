import crypto from "node:crypto";

export function hashString(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function safeCompare(a: string, b: string) {
  const hashedA = crypto.createHash("sha256").update(a).digest();
  const hashedB = crypto.createHash("sha256").update(b).digest();

  return crypto.timingSafeEqual(hashedA, hashedB);
}
