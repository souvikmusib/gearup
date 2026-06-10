// JWT secret resolution + boot-time validation.
//
// Rules:
// - Any deployed environment (Vercel preview, staging, production) MUST
//   provide a real JWT_SECRET (>=16 chars). Detected via VERCEL_ENV being set,
//   or NODE_ENV === 'production'.
// - Only a local dev environment (NODE_ENV !== 'production' AND VERCEL_ENV
//   is unset) may fall back to the dev secret, and even then we warn loudly.
// - Validation runs at module load so a misconfigured deploy fails fast at
//   boot instead of on the first auth request.

const DEV_FALLBACK_JWT_SECRET = 'dev-only-jwt-secret-change-me';

function isLocalDev(): boolean {
  return process.env.NODE_ENV !== 'production' && !process.env.VERCEL_ENV;
}

function resolveSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 16) return secret;

  if (isLocalDev()) {
    console.warn(
      '[jwt-secret] JWT_SECRET missing or too short. Using insecure local-dev fallback. ' +
        'Set JWT_SECRET (>=16 chars) for any deployed environment.',
    );
    return DEV_FALLBACK_JWT_SECRET;
  }

  throw new Error(
    '[jwt-secret] JWT_SECRET is required in all deployed environments and must be at least 16 characters long. ' +
      `Got: ${secret ? `length=${secret.length}` : 'unset'}; NODE_ENV=${process.env.NODE_ENV}; VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'}.`,
  );
}

// Validate at module load so the process refuses to start with bad config.
const RESOLVED_JWT_SECRET = resolveSecret();

export function getJwtSecret(): string {
  return RESOLVED_JWT_SECRET;
}
