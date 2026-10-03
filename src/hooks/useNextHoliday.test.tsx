import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useNextHoliday } from './useNextHoliday';

/** Fresh client per render so staleTime Infinity never leaks between tests. */
const renderNextHoliday = (enabled: boolean, timeZone: string | undefined) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useNextHoliday(enabled, timeZone), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
};

/** Nager.Date-shaped payload row. */
const nagerRow = (date: string, localName: string, name: string) => ({
  date,
  localName,
  name,
  global: true,
  counties: null,
  launchYear: null,
  types: ['Public'],
});

const jsonRes = (body: unknown) => ({ ok: true, json: async () => body });

describe('useNextHoliday', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('counts down to the next holiday at the city’s midnight, merging both years', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-12-28T12:00:00+08:00'));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/2027/')) {
        return jsonRes([nagerRow('2027-01-01', '元旦新年', "New Year's Day")]);
      }
      return jsonRes([nagerRow('2026-12-25', '聖誕節', 'Christmas Day')]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderNextHoliday(true, 'Asia/Hong_Kong');

    await waitFor(() => expect(result.current).toBeDefined());
    // 2026-12-28 → 2027-01-01 in Asia/Hong_Kong, from the next-year payload.
    expect(result.current?.holiday.date).toBe('2027-01-01');
    expect(result.current?.daysUntil).toBe(4);
    expect(result.current?.isToday).toBe(false);
    // One query, two year requests.
    expect(fetchMock).toHaveBeenCalledWith('https://date.nager.at/api/v3/PublicHolidays/2026/HK');
    expect(fetchMock).toHaveBeenCalledWith('https://date.nager.at/api/v3/PublicHolidays/2027/HK');
  });

  it('falls back to the bundled snapshot when the network fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-06-10T02:00:00+08:00'));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const { result } = renderNextHoliday(true, 'Asia/Hong_Kong');

    await waitFor(() => expect(result.current).toBeDefined());
    // Snapshot still knows 端午節 (2026-06-19), 9 days out.
    expect(result.current?.holiday.nameTc).toBe('端午節');
    expect(result.current?.daysUntil).toBe(9);
  });

  it('does not fetch and stays undefined when disabled (non-HK city)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { result } = renderNextHoliday(false, 'Asia/Hong_Kong');

    await waitFor(() => expect(result.current).toBeUndefined());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('hides the countdown for a non-HK city even with a warm cache', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-06-10T02:00:00+08:00'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonRes([nagerRow('2026-06-19', '端午節', 'Dragon Boat Festival')])),
    );

    // Warm the cache for HK, then point the same cache at a disabled
    // (non-HK) query: React Query still returns cached data for disabled
    // queries, so the hook itself must gate on `enabled`.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const hk = renderHook(() => useNextHoliday(true, 'Asia/Hong_Kong'), { wrapper });
    await waitFor(() => expect(hk.result.current?.holiday.nameTc).toBe('端午節'));

    const vancouver = renderHook(() => useNextHoliday(false, 'America/Vancouver'), { wrapper });
    await waitFor(() => expect(vancouver.result.current).toBeUndefined());
  });
});
