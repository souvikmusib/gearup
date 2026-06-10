import { z } from 'zod';

/**
 * Centralized password policy used across every endpoint that sets or changes
 * an admin password (login change-password, admin create/update, etc).
 *
 * Policy:
 *  - Minimum length 12.
 *  - At least one letter AND one digit (mixed character classes).
 *  - Reject a small list of most-common / trivial passwords.
 *
 * Keep this single source of truth so admin-created and self-changed passwords
 * always satisfy the same floor.
 */

// A short list of the most common / obviously weak passwords. Kept small and
// case-insensitive on purpose — we are not trying to ship haveibeenpwned here,
// only to stop the truly trivial cases like `password123` or `admin1234`.
const COMMON_PASSWORDS = new Set(
  [
    'password',
    'password1',
    'password12',
    'password123',
    'password1234',
    'passw0rd',
    'p@ssw0rd',
    'qwerty123',
    'qwerty1234',
    'admin123',
    'admin1234',
    'administrator',
    'welcome1',
    'welcome123',
    'letmein123',
    'iloveyou1',
    '12345678',
    '123456789',
    '1234567890',
    'abcdef123',
    'abcd1234',
    'changeme1',
    'changeme123',
  ].map((p) => p.toLowerCase()),
);

export const PASSWORD_MIN_LENGTH = 12;

export const passwordPolicy = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), {
    message: 'Password must contain at least one letter and one digit',
  })
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), {
    message: 'Password is too common — choose something less guessable',
  });
