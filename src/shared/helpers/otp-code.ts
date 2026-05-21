import { hashString } from "./string";

export function generateOtpCode() {
  const codeLength = 6;
  const chars = "ABCDEFGHIJKLMNPQRSTUVWXYZ123456789";
  const values = crypto.getRandomValues(new Uint8Array(codeLength));

  const code = Array.from(values, (value) => chars[value % chars.length]).join(
    "",
  );

  const hashedCode = hashString(code);

  return {
    code,
    hashedCode,
  };
}
