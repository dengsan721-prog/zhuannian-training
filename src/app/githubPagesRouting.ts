type DirectRouteLocation = {
  pathname: string;
  search: string;
  hash: string;
};

export function directPathToHashUrl({
  pathname,
  search,
  hash,
  basePath,
}: DirectRouteLocation & { basePath: string }): string | null {
  if (hash) return null;

  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
  if (pathname === normalizedBase || pathname === normalizedBase.slice(0, -1)) {
    return null;
  }
  if (!pathname.startsWith(normalizedBase)) return null;

  const routePath = pathname.slice(normalizedBase.length - 1);
  return `${normalizedBase}#${routePath}${search}`;
}

export function redirectDirectPathToHashRoute(location = window.location): void {
  const target = directPathToHashUrl({
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
    basePath: import.meta.env.BASE_URL,
  });
  if (target) {
    window.location.replace(target);
  }
}
