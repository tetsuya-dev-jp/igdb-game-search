import { apiRequest } from '@apis/base_api';
import { RequestUrlResponse, RequestUrlResponsePromise, requestUrl } from 'obsidian';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('obsidian', () => ({
  ...jest.requireActual<typeof import('obsidian')>('obsidian'),
  requestUrl: jest.fn(),
}));

const mockRequestUrl = requestUrl as jest.MockedFunction<typeof requestUrl>;

describe('apiRequest', () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  it('converts HTTP 4xx responses into ApiError with status', async () => {
    mockRequestUrl.mockResolvedValueOnce({ status: 401, json: {} } as RequestUrlResponse);

    await expect(apiRequest('https://example.com')).rejects.toMatchObject({ name: 'ApiError', status: 401 });
  });

  it('passes 2xx response json through', async () => {
    mockRequestUrl.mockResolvedValueOnce({ status: 200, json: { ok: true } } as RequestUrlResponse);

    await expect(apiRequest('https://example.com')).resolves.toEqual({ ok: true });
  });

  it('appends query params to the request url', async () => {
    mockRequestUrl.mockResolvedValueOnce({ status: 200, json: {} } as RequestUrlResponse);

    await apiRequest('https://example.com', { params: { a: '1', b: 'two words' } });

    const call = mockRequestUrl.mock.calls[0][0];
    const callUrl = new URL(typeof call === 'string' ? call : call.url);
    expect(callUrl.searchParams.get('a')).toBe('1');
    expect(callUrl.searchParams.get('b')).toBe('two words');
  });

  it('defaults to GET with merged headers, custom headers overriding defaults', async () => {
    mockRequestUrl.mockResolvedValueOnce({ status: 200, json: {} } as RequestUrlResponse);

    await apiRequest('https://example.com', { headers: { Accept: 'application/json' } });

    const call = mockRequestUrl.mock.calls[0][0];
    const options = typeof call === 'string' ? null : call;
    expect(options?.method).toBe('GET');
    expect(options?.headers.Accept).toBe('application/json');
    expect(options?.headers['Content-Type']).toBe('application/json; charset=utf-8');
  });

  it('rejects with ApiError 408 when the request never settles', async () => {
    mockRequestUrl.mockReturnValueOnce(new Promise(() => {}) as RequestUrlResponsePromise);

    await expect(apiRequest('https://example.com', { timeoutMs: 50 })).rejects.toMatchObject({
      name: 'ApiError',
      status: 408,
    });
  });

  it('resolves fast responses unaffected by the timeout', async () => {
    mockRequestUrl.mockResolvedValueOnce({ status: 200, json: { ok: true } } as RequestUrlResponse);

    await expect(apiRequest('https://example.com', { timeoutMs: 50 })).resolves.toEqual({ ok: true });
  });

  it('resolves slow responses that stay under the timeout', async () => {
    mockRequestUrl.mockReturnValueOnce(
      new Promise(resolve => {
        window.setTimeout(() => resolve({ status: 200, json: { ok: true } } as RequestUrlResponse), 20);
      }) as RequestUrlResponsePromise,
    );

    await expect(apiRequest('https://example.com', { timeoutMs: 200 })).resolves.toEqual({ ok: true });
  });
});
