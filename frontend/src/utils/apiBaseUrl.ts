import { requireEnv } from './env';

export const getApiBaseUrl = (): string => {
  const rawBaseUrl = requireEnv('VITE_API_URL').trim();
  const trimmedBaseUrl = rawBaseUrl.replace(/\/+$/, '');

  if (trimmedBaseUrl.endsWith('/api')) {
    return trimmedBaseUrl.slice(0, -4);
  }

  return trimmedBaseUrl;
};
