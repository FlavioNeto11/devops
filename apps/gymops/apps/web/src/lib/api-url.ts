const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function normalizeBasePath(value: string | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed || trimmed === '/') {
    return '';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

function getSameOriginApiPath(): string {
  const appBasePath = normalizeBasePath(process.env.NEXT_PUBLIC_APP_BASE_PATH);
  return `${appBasePath}/api`;
}

function getCurrentHostApiUrl(): string {
  if (globalThis.location === undefined) {
    return 'http://localhost:3001';
  }

  return `${globalThis.location.protocol}//${globalThis.location.hostname}:3001`;
}

export function resolveApiUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (!configuredUrl) {
    return getCurrentHostApiUrl();
  }

  if (configuredUrl.startsWith('/')) {
    return configuredUrl;
  }

  try {
    const parsedUrl = new URL(configuredUrl);
    if (
      globalThis.location !== undefined
      && LOCAL_HOSTNAMES.has(parsedUrl.hostname)
      && !LOCAL_HOSTNAMES.has(globalThis.location.hostname)
    ) {
      return getSameOriginApiPath();
    }
  } catch {
    return configuredUrl;
  }

  return configuredUrl;
}