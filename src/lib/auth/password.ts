/**
 * Password hashing helpers.
 *
 * Uses {@link https://github.com/dcodeIO/bcrypt.js bcryptjs}, a pure-JS bcrypt
 * implementation. Pure JS avoids native-compilation issues on Vercel's
 * serverless runtime while remaining a well-understood, salted, slow hash.
 */

import bcrypt from "bcryptjs";

/** Cost factor for bcrypt. 10 is a sane default for interactive logins. */
const SALT_ROUNDS = 10;

/** Hash a plaintext password. Returns a self-describing bcrypt hash string. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/** Verify a plaintext password against a stored bcrypt hash. */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}
