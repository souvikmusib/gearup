const DEV_FALLBACK_JWT_SECRET = 'dev-only-jwt-secret-change-me';

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 16) return secret;

  if (process.env.NODE_ENV !== 'production') {
    console.warn('JWT_SECRET missing or too short. Using insecure development fallback secret.');
    return DEV_FALLBACK_JWT_SECRET;
  }

  throw new Error('JWT_SECRET is required in production and must be at least 16 characters long.');
}

