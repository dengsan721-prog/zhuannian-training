import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('commenting mobile styles', () => {
  it('keeps the phone input compact enough for first-screen use', () => {
    const css = readFileSync(resolve('src/styles/global.css'), 'utf8');

    expect(css).toContain('@media (max-width: 560px)');
    expect(css).toMatch(/\.commenting-field textarea \{ min-height: 6\.25rem; \}/);
  });
});
