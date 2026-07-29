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

  it('rejects unknown browser origins when an allowlist is configured', () => {
    expect(
      isCorsOriginAllowed('https://attacker.example.com', 'https://oop-uet.github.io'),
    ).toBe(false);
  });

  it('allows requests without an Origin header and preserves wildcard behavior', () => {
    expect(isCorsOriginAllowed(undefined, 'https://oop-uet.github.io')).toBe(true);
    expect(isCorsOriginAllowed('http://localhost:5173', '*')).toBe(true);
  });
});
