import { describe, expect, it } from 'vitest';
import { isCorsOriginAllowed } from './cors.js';

describe('CORS origin allowlist', () => {
  it('allows the custom frontend domains alongside configured origins', () => {
    const configured = 'https://oop-uet.github.io';

    expect(isCorsOriginAllowed('https://oop-uet.github.io', configured)).toBe(true);
    expect(isCorsOriginAllowed('https://uetcodehub.xyz', configured)).toBe(true);
    expect(isCorsOriginAllowed('https://www.uetcodehub.xyz', configured)).toBe(true);
  });

  it('supports multiple configured origins separated by commas', () => {
    const configured = 'http://localhost:5173, https://preview.example.com';

    expect(isCorsOriginAllowed('http://localhost:5173', configured)).toBe(true);
    expect(isCorsOriginAllowed('https://preview.example.com', configured)).toBe(true);
  });

  it('allows only the configured Cloudflare Pages project and its previews', () => {
    expect(isCorsOriginAllowed('https://uetcodehub.pages.dev', 'https://app.example.com', 'uetcodehub')).toBe(true);
    expect(isCorsOriginAllowed('https://feature-x.uetcodehub.pages.dev', 'https://app.example.com', 'uetcodehub')).toBe(true);
    expect(isCorsOriginAllowed('https://attacker.pages.dev', 'https://app.example.com', 'uetcodehub')).toBe(false);
    expect(isCorsOriginAllowed('https://feature-x.another-project.pages.dev', 'https://app.example.com', 'uetcodehub')).toBe(false);
  });

  it('rejects unknown browser origins when an allowlist is configured', () => {
    expect(
      isCorsOriginAllowed('https://attacker.example.com', 'https://oop-uet.github.io'),
    ).toBe(false);
  });

  it('allows requests without an Origin header and preserves wildcard behavior', () => {
    expect(isCorsOriginAllowed(undefined, 'https://oop-uet.github.io')).toBe(true);
    expect(isCorsOriginAllowed('http://localhost:5173', '*')).toBe(true);
  });

  it('does not turn an unset production allowlist into a cross-origin wildcard', () => {
    expect(isCorsOriginAllowed('https://attacker.example.com', undefined, null, false)).toBe(false);
    expect(isCorsOriginAllowed('https://uetcodehub.xyz', undefined, null, false)).toBe(true);
  });
});
