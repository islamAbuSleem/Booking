import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

/**
 * T14 — Argon2id, not bcrypt.
 *
 * OWASP scopes bcrypt to legacy systems: it is CPU-hard only, cheap to
 * parallelise on GPUs, and silently truncates at 72 bytes. Argon2id with
 * 19 MiB / t=2 / p=1 is the OWASP minimum, and `needsRehash` lets a login
 * transparently upgrade a hash made with older parameters.
 *
 * All hashing lives here so the timing-equality dummy path is in one place
 * and unit-testable without a database.
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * A real Argon2id hash (of a throwaway password) used only for the dummy
 * verify on a miss. Verifying against a well-formed hash costs about the same
 * as verifying a real one, so "no such email" and "wrong password" take the
 * same time and the response timing does not leak account existence.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$/jObFxnicZYqsgDTFH9acw$F+b3i+JK+2XVc4VhH2cIA/2A/gNvaQC6X1O+HnifOC8';

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      // A malformed stored hash is treated as a mismatch, never a 500: the
      // caller maps `false` to INVALID_CREDENTIALS like any wrong password.
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    try {
      return argon2.needsRehash(hash, ARGON2_OPTIONS);
    } catch {
      return true;
    }
  }

  /**
   * Runs on the "user not found" and "OAuth-only account" paths so those
   * responses cost ~one verify, exactly like a wrong-password response.
   * Never throws and never returns anything observable.
   */
  async dummyVerify(): Promise<void> {
    try {
      await argon2.verify(DUMMY_HASH, 'mismatch-for-timing-equality');
    } catch {
      // Expected: the password never matches. The cost is the point.
    }
  }
}
