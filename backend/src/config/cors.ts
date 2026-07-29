import type { CorsOptions } from 'cors';

const PLATFORM_ORIGINS = new Set([
  'https://uetcodehub.xyz',
  'https://www.uetcodehub.xyz',
]);

function configuredOrigins(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

export function isCorsOriginAllowed(
  origin: string | undefined,
  configuredValue = process.env.CORS_ORIGIN,
): boolean {
  if (!origin) return true;

  const configured = configuredOrigins(configuredValue);
  if (configured.size === 0 || configured.has('*')) return true;

  return configured.has(origin) || PLATFORM_ORIGINS.has(origin);
}

export function createCorsOrigin(
  configuredValue = process.env.CORS_ORIGIN,
): CorsOptions['origin'] {
  return (origin, callback) => {
    callback(null, isCorsOriginAllowed(origin, configuredValue));
  };
}
