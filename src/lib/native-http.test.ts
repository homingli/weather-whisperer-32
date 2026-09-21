import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isNativePlatform, nativeHttpGetText } from './native-http';

const { isNativePlatformMock, getMock } = vi.hoisted(() => ({
  isNativePlatformMock: vi.fn<() => boolean>(),
  getMock: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: isNativePlatformMock },
  CapacitorHttp: { get: getMock },
}));

const URL = 'https://data.weather.gov.hk/weatherAPI/hko_data/F3/Gridded_rainfall_nowcast.csv';

describe('isNativePlatform', () => {
  it('mirrors Capacitor.isNativePlatform', () => {
    isNativePlatformMock.mockReturnValue(true);
    expect(isNativePlatform()).toBe(true);
    isNativePlatformMock.mockReturnValue(false);
    expect(isNativePlatform()).toBe(false);
  });
});

describe('nativeHttpGetText', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('returns the body text, status and parsed Last-Modified', async () => {
    getMock.mockResolvedValue({
      status: 200,
      data: 'lat,lon,val\n22.3,114.1,5',
      headers: { 'Content-Type': 'text/csv', 'Last-Modified': 'Mon, 21 Sep 2026 02:58:20 GMT' },
    });

    const res = await nativeHttpGetText(URL, 5000);
    expect(res).toEqual({
      status: 200,
      text: 'lat,lon,val\n22.3,114.1,5',
      lastModified: Date.parse('Mon, 21 Sep 2026 02:58:20 GMT'),
    });
    expect(getMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: URL,
        responseType: 'text',
        readTimeout: 5000,
        connectTimeout: 5000,
      }),
    );
  });

  it('finds Last-Modified regardless of header key casing', async () => {
    getMock.mockResolvedValue({
      status: 200,
      data: 'x',
      headers: { 'last-modified': 'Mon, 21 Sep 2026 02:58:20 GMT' },
    });
    const res = await nativeHttpGetText(URL, 5000);
    expect(res.lastModified).toBe(Date.parse('Mon, 21 Sep 2026 02:58:20 GMT'));
  });

  it('returns lastModified 0 when the header is absent or unparseable', async () => {
    getMock.mockResolvedValue({ status: 200, data: 'x', headers: {} });
    expect((await nativeHttpGetText(URL, 5000)).lastModified).toBe(0);

    getMock.mockResolvedValue({ status: 200, data: 'x', headers: { 'Last-Modified': 'nonsense' } });
    expect((await nativeHttpGetText(URL, 5000)).lastModified).toBe(0);
  });

  it('caps connectTimeout at 10s for long total timeouts', async () => {
    getMock.mockResolvedValue({ status: 200, data: 'x', headers: {} });
    await nativeHttpGetText(URL, 30_000);
    expect(getMock).toHaveBeenCalledWith(
      expect.objectContaining({ readTimeout: 30_000, connectTimeout: 10_000 }),
    );
  });

  it('rejects on non-2xx status', async () => {
    getMock.mockResolvedValue({ status: 404, data: 'not found', headers: {} });
    await expect(nativeHttpGetText(URL, 5000)).rejects.toThrow('HTTP 404');
  });

  it('rejects with a TimeoutError at timeoutMs while the native request is still pending', async () => {
    // Never-settling native call simulates a slow-drip server; the helper
    // must surface the timeout anyway (the orphan is by design).
    getMock.mockReturnValue(new Promise(() => {}));
    await expect(nativeHttpGetText(URL, 20)).rejects.toThrow('timed out after 20ms');
  });
});
