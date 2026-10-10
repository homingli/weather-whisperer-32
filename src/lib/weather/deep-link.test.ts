import { describe, it, expect } from 'vitest';
import { parseDeepLinkLocation } from './deep-link';

describe('parseDeepLinkLocation', () => {
  it('parses lat, lon, and name from a shared link', () => {
    expect(parseDeepLinkLocation('?lat=22.319&lon=114.169&name=Kowloon')).toEqual({
      name: 'Kowloon',
      latitude: 22.319,
      longitude: 114.169,
      country: '',
    });
  });

  it('decodes encoded and plus-encoded names', () => {
    expect(parseDeepLinkLocation('?lat=22.32&lon=114.17&name=Kowloon%20Tong')?.name).toBe('Kowloon Tong');
    expect(parseDeepLinkLocation('?lat=22.32&lon=114.17&name=Tsim+Sha+Tsui')?.name).toBe('Tsim Sha Tsui');
  });

  it('returns an empty name when the link carries none', () => {
    const parsed = parseDeepLinkLocation('?lat=49.28&lon=-123.12');
    expect(parsed).not.toBeNull();
    expect(parsed?.name).toBe('');
  });

  it('returns null for missing, non-numeric, or out-of-range coords', () => {
    expect(parseDeepLinkLocation('')).toBeNull();
    expect(parseDeepLinkLocation('?lon=114.17')).toBeNull();
    expect(parseDeepLinkLocation('?lat=abc&lon=114.17')).toBeNull();
    expect(parseDeepLinkLocation('?lat=&lon=114.17')).toBeNull();
    expect(parseDeepLinkLocation('?lat=91&lon=114.17')).toBeNull();
    expect(parseDeepLinkLocation('?lat=22.32&lon=-181')).toBeNull();
  });

  it('accepts the full valid range including poles and dateline', () => {
    expect(parseDeepLinkLocation('?lat=-90&lon=180')).toEqual({
      name: '',
      latitude: -90,
      longitude: 180,
      country: '',
    });
  });

  it('trims whitespace and caps absurd names at 100 chars', () => {
    expect(parseDeepLinkLocation('?lat=22.32&lon=114.17&name=%20%20Kowloon')?.name).toBe('Kowloon');
    expect(parseDeepLinkLocation(`?lat=22.32&lon=114.17&name=${'x'.repeat(300)}`)?.name).toHaveLength(100);
  });

  it('ignores unrelated query params', () => {
    expect(parseDeepLinkLocation('?utm_source=chat&lat=22.32&lon=114.17&name=Kowloon&foo=bar')?.latitude).toBe(22.32);
  });
});
