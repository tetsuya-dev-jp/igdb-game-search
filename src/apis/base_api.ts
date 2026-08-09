import { GameEntry } from '@models/game.model';
import { requestUrl } from 'obsidian';

export interface GameMetadataApi {
  getByQuery(query: string): Promise<GameEntry[]>;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  url: string,
  options: {
    method?: 'GET' | 'POST';
    params?: Record<string, string | number>;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const apiURL = new URL(url);
  appendQueryParams(apiURL, options.params ?? {});

  const res = await withTimeout(
    requestUrl({
      url: apiURL.href,
      method: options.method ?? 'GET',
      body: options.body,
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/json; charset=utf-8',
        ...options.headers,
      },
      throw: false,
    }),
    options.timeoutMs ?? 30_000,
  );

  if (res.status >= 400) {
    throw new ApiError(`Request failed with status ${res.status}`, res.status);
  }

  return res.json as T;
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs = 30_000, message = 'Request timed out'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new ApiError(message, 408)), timeoutMs);
    }),
  ]);
}

function appendQueryParams(url: URL, params: Record<string, string | number>): void {
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value.toString());
  });
}
