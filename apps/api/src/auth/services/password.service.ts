import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';

interface ScryptOptions {
  N: number;
  r: number;
  p: number;
}

// A hand-rolled Promise wrapper rather than `util.promisify(scrypt)`: Node's
// scrypt overloads (with/without an options object) confuse promisify's
// overload resolution, so promisify(scrypt) ends up untyped for the
// options-accepting call this file actually needs.
function scryptAsync(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

/**
 * scrypt (via Node's built-in `crypto`, no native addon) rather than
 * bcrypt/argon2. This is a deliberate portability choice: native-binary
 * password-hashing packages are exactly the kind of dependency that can
 * silently break across "local dev / Vercel / self-hosted Linux server"
 * (different platform/arch prebuilds, or a missing C++ toolchain). scrypt
 * is NIST/OWASP-acceptable and ships with Node itself everywhere.
 *
 * Encoded format: `scrypt$N$r$p$<saltHex>$<hashHex>` — parameters are
 * embedded in the stored hash so they can be upgraded later without
 * invalidating existing credentials.
 */
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

@Injectable()
export class PasswordService {
  async hash(plaintext: string): Promise<string> {
    const salt = randomBytes(16);
    const derivedKey = await scryptAsync(plaintext, salt, SCRYPT_PARAMS.keylen, {
      N: SCRYPT_PARAMS.N,
      r: SCRYPT_PARAMS.r,
      p: SCRYPT_PARAMS.p,
    });

    return [
      'scrypt',
      SCRYPT_PARAMS.N,
      SCRYPT_PARAMS.r,
      SCRYPT_PARAMS.p,
      salt.toString('hex'),
      derivedKey.toString('hex'),
    ].join('$');
  }

  async verify(plaintext: string, encoded: string): Promise<boolean> {
    const parts = encoded.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

    const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
    const N = Number(nStr);
    const r = Number(rStr);
    const p = Number(pStr);
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

    const salt = Buffer.from(saltHex as string, 'hex');
    const expected = Buffer.from(hashHex as string, 'hex');

    const actual = await scryptAsync(plaintext, salt, expected.length, { N, r, p });

    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  }
}
