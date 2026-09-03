import type { CorsOptions } from 'cors';
import { getCloudflarePagesProject } from './hybrid-cloudflare.js';

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
  cloudflarePagesProject = getCloudflarePagesProject(),
  allowUnconfiguredOrigins = process.env.NODE_ENV !== 'production',
): boolean {
  if (!origin) return true;

  const configured = configuredOrigins(configuredValue);
  if (configured.has('*')) return true;

  // Pages preview hostnames are scoped to one configured project. Never use a
  // broad *.pages.dev match: an unrelated account can create such a hostname.
  const pagesOrigin = cloudflarePagesProject
    ? new RegExp(`^https://(?:[a-z0-9-]+\\.)?${cloudflarePagesProject}\\.pages\\.dev$`, 'i')
    : null;

  if (configured.size === 0 && allowUnconfiguredOrigins) return true;
  return configured.has(origin) || PLATFORM_ORIGINS.has(origin) || Boolean(pagesOrigin?.test(origin));
}

export function createCorsOrigin(
  configuredValue = process.env.CORS_ORIGIN,
  cloudflarePagesProject = getCloudflarePagesProject(),
): CorsOptions['origin'] {
  return (origin, callback) => {
    callback(null, isCorsOriginAllowed(origin, configuredValue, cloudflarePagesProject));
  };
}
