import { Logger } from '@nestjs/common';

const logger = new Logger('JwtSecretHelper');
export const FALLBACK_DEV_SECRET = 'super_secret_dev_key_change_in_prod';
export const FATAL_JWT_SECRET_ERROR =
  'FATAL: JWT_SECRET must be explicitly defined in production environments.';

let warnedFallback = false;

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!secret || secret.trim() === '') {
    if (isProduction) {
      throw new Error(FATAL_JWT_SECRET_ERROR);
    }
    if (!warnedFallback) {
      logger.warn(
        'JWT_SECRET is not defined. Using insecure development fallback secret. NEVER use this in production!',
      );
      warnedFallback = true;
    }
    return FALLBACK_DEV_SECRET;
  }

  return secret.trim();
}
