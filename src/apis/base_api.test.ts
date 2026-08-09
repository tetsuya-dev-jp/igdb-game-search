import { apiRequest } from '@apis/base_api';
import { requestUrl } from 'obsidian';

jest.mock('obsidian', () => ({
  ...jest.requireActual('obsidian'),
  requestUrl: jest.fn(),
}));

const mockRequestUrl = requestUrl as jest.Mock;

describe('apiRequest', () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  it('converts HTTP 4xx responses into ApiError with status', async () => {
    mockRequestUrl.mockResolvedValueOnce({ status: 401, json: {} });

    await expect(apiRequest('https://example.com')).rejects.toMatchObject({ name: 'ApiError', status: 401 });
  });

  it('passes 2xx response json through', async () => {
    mockRequestUrl.mockResolvedValueOnce({ status: 200, json: { ok: true } });

    await expect(apiRequest('https://example.com')).resolves.toEqual({ ok: true });
  });

  it('appends query params to the request url', async () => {
    mockRequestUrl.mockResolvedValueOnce({ status: 200, json: {} });

    await apiRequest('https://example.com', { params: { a: '1', b: 'two words' } });

    const callUrl = new URL(mockRequestUrl.mock.calls[0][0].url);
    expect(callUrl.searchParams.get('a')).toBe('1');
    expect(callUrl.searchParams.get('b')).toBe('two words');
  });

  it('defaults to GET with merged headers, custom headers overriding defaults', async () => {
    mockRequestUrl.mockResolvedValueOnce({ status: 200, json: {} });

    await apiRequest('https://example.com', { headers: { Accept: 'application/json' } });

    const call = mockRequestUrl.mock.calls[0][0];
    expect(call.method).toBe('GET');
    expect(call.headers.Accept).toBe('application/json');
    expect(call.headers['Content-Type']).toBe('application/json; charset=utf-8');
  });

  it('rejects with ApiError 408 when the request never settles', async () => {
    mockRequestUrl.mockReturnValueOnce(new Promise(() => {}));

    await expect(apiRequest('https://example.com', { timeoutMs: 50 })).rejects.toMatchObject({
      name: 'ApiError',
      status: 408,
    });
  });

  it('resolves fast responses unaffected by the timeout', async () => {
    mockRequestUrl.mockResolvedValueOnce({ status: 200, json: { ok: true } });

    await expect(apiRequest('https://example.com', { timeoutMs: 50 })).resolves.toEqual({ ok: true });
  });

  it('resolves slow responses that stay under the timeout', async () => {
    mockRequestUrl.mockReturnValueOnce(
      new Promise(resolve => {
        setTimeout(() => resolve({ status: 200, json: { ok: true } }), 20);
      }),
    );

    await expect(apiRequest('https://example.com', { timeoutMs: 200 })).resolves.toEqual({ ok: true });
  });
});
