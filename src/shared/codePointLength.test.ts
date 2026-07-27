import { describe, expect, it } from 'vitest';
import { codePointLength } from './codePointLength';

describe('codePointLength', () => {
  it('counts Unicode code points rather than UTF-16 code units', () => {
    expect(codePointLength('家'.repeat(199) + '🙂')).toBe(200);
    expect(codePointLength('🙂'.repeat(200))).toBe(200);
    expect(codePointLength('🙂'.repeat(201))).toBe(201);
  });

  it('does not silently normalize the value being counted', () => {
    expect(codePointLength('e\u0301')).toBe(2);
    expect(codePointLength('é')).toBe(1);
  });
});
