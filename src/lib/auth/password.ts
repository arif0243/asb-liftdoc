import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export type PasswordDigest = {
  salt: string;
  hash: string;
};

export function assertPasswordStrength(password: string) {
  if (password.length < 10) {
    throw new Error("Password must be at least 10 characters.");
  }
  if (password.length > 200) {
    throw new Error("Password is too long.");
  }
}

export function hashPassword(password: string): PasswordDigest {
  assertPasswordStrength(password);
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

export function verifyPassword(
  password: string,
  digest: PasswordDigest,
): boolean {
  try {
    const expected = Buffer.from(digest.hash, "hex");
    const actual = scryptSync(password, digest.salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}