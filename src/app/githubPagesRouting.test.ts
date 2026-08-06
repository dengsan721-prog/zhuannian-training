import { describe, expect, it } from 'vitest';
import { directPathToHashUrl } from './githubPagesRouting';

describe('directPathToHashUrl', () => {
  it('converts a GitHub Pages direct route into a hash route', () => {
    expect(directPathToHashUrl({
      pathname: '/zhuannian-training/join',
      search: '',
      hash: '',
      basePath: '/zhuannian-training/',
    })).toBe('/zhuannian-training/#/join');
  });

  it('keeps query strings when converting direct routes', () => {
    expect(directPathToHashUrl({
      pathname: '/zhuannian-training/scenes',
      search: '?from=share',
      hash: '',
      basePath: '/zhuannian-training/',
    })).toBe('/zhuannian-training/?from=share#/scenes');
  });

  it('does not rewrite the app root or existing hash routes', () => {
    expect(directPathToHashUrl({
      pathname: '/zhuannian-training/',
      search: '',
      hash: '',
      basePath: '/zhuannian-training/',
    })).toBeNull();
    expect(directPathToHashUrl({
      pathname: '/zhuannian-training/',
      search: '',
      hash: '#/join',
      basePath: '/zhuannian-training/',
    })).toBeNull();
  });
});
