/**
 * Hong Kong public holiday feed from Nager.Date (https://date.nager.at).
 *
 * The list is the official "general holidays" set (17 days in 2026) — the
 * days everyone gets off, Easter trio included. It is published once per
 * year and never changes for that year, so callers cache per (region, year)
 * with staleTime Infinity and effectively refetch once per session.
 *
 * Nager returns both names the UI needs: `localName` is Traditional Chinese
 * for HK, `name` is English — so no holiday-name translation table is kept.
 */

export interface Holiday {
  /** Calendar date in the holiday's jurisdiction, `yyyy-MM-dd`. */
  date: string;
  /** English name (Nager `name`). */
  nameEn: string;
  /** Traditional Chinese name (Nager `localName`). */
  nameTc: string;
}

/** Nager.Date v3 PublicHolidays payload (only the fields we consume). */
interface NagerHoliday {
  date: string;
  localName: string;
  name: string;
}

const NAGER_ENDPOINT = 'https://date.nager.at/api/v3/PublicHolidays';

/**
 * Bundled 2026 snapshot (verified against the live API on 2026-10-04) —
 * the offline/failure fallback so a PWA session still gets a countdown
 * when the network or Nager is unavailable. Years outside the snapshot
 * have no fallback: the fetch resolves empty and the chip simply hides.
 */
const HK_2026_FALLBACK: Holiday[] = [
  { date: '2026-01-01', nameTc: '元旦新年', nameEn: "New Year's Day" },
  { date: '2026-02-17', nameTc: '農曆年初一', nameEn: 'Lunar New Year' },
  { date: '2026-02-18', nameTc: '農曆年初二', nameEn: 'Second day of Lunar New Year' },
  { date: '2026-02-19', nameTc: '農曆年初三', nameEn: 'Third day of Lunar New Year' },
  { date: '2026-04-03', nameTc: '耶穌受難節', nameEn: 'Good Friday' },
  { date: '2026-04-04', nameTc: '耶穌受難節翌日', nameEn: 'Holy Saturday' },
  { date: '2026-04-06', nameTc: '清明節', nameEn: 'Ching Ming Festival' },
  { date: '2026-04-07', nameTc: '復活節星期一', nameEn: 'Easter Monday' },
  { date: '2026-05-01', nameTc: '勞動節', nameEn: 'Labour Day' },
  { date: '2026-05-25', nameTc: '佛誕', nameEn: "Buddha's Birthday" },
  { date: '2026-06-19', nameTc: '端午節', nameEn: 'Dragon Boat Festival' },
  {
    date: '2026-07-01',
    nameTc: '香港特別行政區成立紀念日',
    nameEn: 'Hong Kong Special Administrative Region Establishment Day',
  },
  { date: '2026-09-26', nameTc: '中秋節翌日', nameEn: 'Day following the Mid-Autumn Festival' },
  { date: '2026-10-01', nameTc: '中華人民共和國國慶日', nameEn: 'National Day' },
  { date: '2026-10-19', nameTc: '重陽節', nameEn: 'Chung Yeung Festival' },
  { date: '2026-12-25', nameTc: '聖誕節', nameEn: 'Christmas Day' },
  { date: '2026-12-26', nameTc: '聖誕節翌日', nameEn: 'Boxing Day' },
];

/** Map one payload row; rows that fail the date-shape check are dropped. */
function toHoliday(row: NagerHoliday): Holiday | null {
  if (typeof row?.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return null;
  return { date: row.date, nameEn: row.name, nameTc: row.localName };
}

/**
 * Fetch one year of HK public holidays. Falls back to the bundled snapshot
 * whenever the request fails or the payload is unusable, so the only way
 * to observe an error here is a year the snapshot does not cover.
 */
export async function fetchHolidays(year: number): Promise<Holiday[]> {
  try {
    const res = await fetch(`${NAGER_ENDPOINT}/${year}/HK`);
    if (!res.ok) throw new Error(`Nager.Date ${year} responded ${res.status}`);
    const payload: unknown = await res.json();
    if (!Array.isArray(payload)) throw new Error('Unexpected Nager.Date payload');
    const mapped = payload
      .map((row) => toHoliday(row as NagerHoliday))
      .filter((h): h is Holiday => h !== null);
    if (mapped.length === 0) throw new Error('Empty Nager.Date list');
    return mapped;
  } catch {
    const prefix = String(year);
    return HK_2026_FALLBACK.filter((h) => h.date.startsWith(prefix));
  }
}
