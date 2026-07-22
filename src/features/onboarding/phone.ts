const CHINESE_MOBILE = /^1[3-9]\d{9}$/;

export function normalizeChineseMobile(input: string): string | null {
  const compact = input.trim().replace(/[\s()-]/g, '');
  const nationalNumber = compact.startsWith('+86')
    ? compact.slice(3)
    : compact.startsWith('86')
      ? compact.slice(2)
      : compact;

  return CHINESE_MOBILE.test(nationalNumber) ? `+86${nationalNumber}` : null;
}
