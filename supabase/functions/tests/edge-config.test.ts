import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = readFileSync('supabase/config.toml', 'utf8');

describe('Task 5 Edge JWT boundaries', () => {
  it('keeps only the public OTP request function anonymous', () => {
    expect(config).toMatch(
      /\[functions\.request-invite-otp\]\s+verify_jwt = false/,
    );
    expect(config).toMatch(
      /\[functions\.complete-enrollment\]\s+verify_jwt = true/,
    );
  });
});
