import { randomBytes } from "node:crypto";
import { hashString } from "./string";

export function generateOpaqueToken() {
  const token = randomBytes(32).toString("base64url");

  return {
    token,
    hashedToken: hashString(token),
  };
}
