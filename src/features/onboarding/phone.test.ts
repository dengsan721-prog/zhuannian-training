import { describe, expect, it } from 'vitest';
import { normalizeChineseMobile } from './phone';

describe('normalizeChineseMobile', () => {
  it.each([
    ['13800138000', '+8613800138000'],
    ['+8613800138000', '+8613800138000'],
    ['+86 138 0013 8000', '+8613800138000'],
  ])('normalizes %s to canonical E.164', (input, expected) => {
    expect(normalizeChineseMobile(input)).toBe(expected);
  });

  it.each(['', '12800138000', '+861380013800', '138001380000', 'not-a-phone'])('rejects %s', (input) => {
    expect(normalizeChineseMobile(input)).toBeNull();
  });
});
