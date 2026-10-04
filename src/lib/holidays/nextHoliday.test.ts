import { describe, it, expect, vi, afterEach } from 'vitest';
import { nextHoliday, todayIsoInZone } from './nextHoliday';
import { fetchHolidays } from './nager';
import type { Holiday } from './nager';

const list: Holiday[] = [
  { date: '2026-06-19', nameEn: 'Dragon Boat Festival', nameTc: '端午節' },
  { date: '2026-01-01', nameEn: "New Year's Day", nameTc: '元旦新年' },
  { date: '2027-01-01', nameEn: 'New Year 2027', nameTc: '二〇二七年元旦' },
];

describe('nextHoliday', () => {
  it('picks the nearest upcoming holiday from an unsorted list', () => {
    const result = nextHoliday(list, '2026-05-01');
    expect(result?.holiday.nameEn).toBe('Dragon Boat Festival');
    expect(result?.daysUntil).toBe(49);
    expect(result?.isToday).toBe(false);
  });

  it('flags the holiday day itself (daysUntil 0)', () => {
    const result = nextHoliday(list, '2026-06-19');
    expect(result?.holiday.nameTc).toBe('端午節');
    expect(result?.daysUntil).toBe(0);
    expect(result?.isToday).toBe(true);
  });

  it('counts tomorrow as 1 day', () => {
    expect(nextHoliday(list, '2026-06-18')?.daysUntil).toBe(1);
  });

  it('rolls over into next year’s list', () => {
    const result = nextHoliday(list, '2026-12-28');
    expect(result?.holiday.date).toBe('2027-01-01');
    expect(result?.daysUntil).toBe(4);
  });

  it('returns null once every holiday has passed', () => {
    expect(nextHoliday(list, '2027-06-01')).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(nextHoliday([], '2026-05-01')).toBeNull();
  });
});

describe('todayIsoInZone', () => {
  it('reads the calendar date in the given zone, not the browser’s', () => {
    // 2026-12-31 16:30 UTC is already 2027-01-01 00:30 in Hong Kong.
    const instant = new Date('2026-12-31T16:30:00Z');
    expect(todayIsoInZone(instant, 'Asia/Hong_Kong')).toBe('2027-01-01');
    expect(todayIsoInZone(instant, 'UTC')).toBe('2026-12-31');
  });

  it('degrades an invalid zone to the browser-local calendar date', () => {
    const now = new Date('2026-12-31T16:30:00Z');
    const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(todayIsoInZone(now, 'Not/AZone')).toBe(todayIsoInZone(now, localZone));
  });
});

describe('fetchHolidays', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps the Nager payload to bilingual holidays', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { date: '2026-05-01', localName: '勞動節', name: 'Labour Day', global: true },
        ],
      }),
    );
    await expect(fetchHolidays(2026)).resolves.toEqual([
      { date: '2026-05-01', nameTc: '勞動節', nameEn: 'Labour Day' },
    ]);
  });

  it('drops rows with an unusable date', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          null,
          { localName: '勞動節', name: 'Labour Day' },
          { date: '01-05-2026', localName: '勞動節', name: 'Labour Day' },
          { date: '2026-05-01', localName: '勞動節', name: 'Labour Day' },
        ],
      }),
    );
    const result = await fetchHolidays(2026);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2026-05-01');
  });

  it('falls back to the bundled 2026 snapshot on HTTP failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const result = await fetchHolidays(2026);
    expect(result).toHaveLength(17);
    expect(result.every((h) => h.date.startsWith('2026'))).toBe(true);
  });

  it('falls back on a non-array payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ error: 'nope' }) }),
    );
    expect(await fetchHolidays(2026)).toHaveLength(17);
  });

  it('resolves empty for years the snapshot does not cover', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(fetchHolidays(2027)).resolves.toEqual([]);
  });
});
