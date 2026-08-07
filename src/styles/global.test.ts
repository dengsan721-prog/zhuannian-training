import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('commenting mobile styles', () => {
  it('defines the Apple-style visual token layer', () => {
    const css = readFileSync(resolve('src/styles/tokens.css'), 'utf8');

    expect(css).toContain('--color-surface-glass: rgba(255, 255, 255, 0.82)');
    expect(css).toContain('--shadow-soft: 0 18px 45px rgba(28, 28, 30, 0.08)');
    expect(css).toContain('--radius-xl: 28px');
    expect(css).toContain('--radius-pill: 999px');
  });

  it('keeps the phone input compact enough for first-screen use', () => {
    const css = readFileSync(resolve('src/styles/global.css'), 'utf8');

    expect(css).toContain('@media (max-width: 560px)');
    expect(css).toMatch(/\.commenting-field textarea \{ min-height: 6\.25rem; \}/);
  });
});
