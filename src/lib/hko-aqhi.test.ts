import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  aqhiLevelFor,
  findNearestAqhiStation,
  parseAqhiRss,
  getHKOAQHI,
  EPD_AQHI_STATIONS,
} from './hko-aqhi';

/** Trimmed from the live feed (https://www.aqhi.gov.hk/epd/ddata/html/out/
 *  aqhi_ind_rss_Eng.xml, 17 Sep 2026 09:30 HKT). Structure and casing are
 *  faithful to the source; only the item count is cut down. */
const EN_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Environmental Protection Department - AQHI</title>
<item><title>Central/Western</title><pubDate>Thu, 17 Sep 2026 09:30:00 +0800</pubDate><description><![CDATA[Central/Western - General Stations: 5 Moderate - Thu, 17 Sep 2026 09:30]]></description></item>
<item><title>Southern</title><pubDate>Thu, 17 Sep 2026 09:30:00 +0800</pubDate><description><![CDATA[Southern - General Stations: 4 Moderate - Thu, 17 Sep 2026 09:30]]></description></item>
<item><title>Tung Chung</title><pubDate>Thu, 17 Sep 2026 09:30:00 +0800</pubDate><description><![CDATA[Tung Chung - General Stations: 3 Low - Thu, 17 Sep 2026 09:30]]></description></item>
<item><title>Central</title><pubDate>Thu, 17 Sep 2026 09:30:00 +0800</pubDate><description><![CDATA[Central - Roadside Stations: 6 Moderate - Thu, 17 Sep 2026 09:30]]></description></item>
<item><title>Mong Kok</title><pubDate>Thu, 17 Sep 2026 09:30:00 +0800</pubDate><description><![CDATA[Mong Kok - Roadside Stations: 8 High - Thu, 17 Sep 2026 09:30]]></description></item>
</channel></rss>`;

/** TC feed sample — note 中 (not 中等) for Moderate and the full-width
 *  date format; the level word is deliberately varied here to prove the
 *  parser never depends on it. */
const TC_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>環境保護署 - 空氣質素健康指數</title>
<item><title>中西區</title><pubDate>Thu, 17 Sep 2026 09:30:00 +0800</pubDate><description><![CDATA[中西區 - 一般監測站: 5 中 - 2026年9月17日 (星期四)]]></description></item>
<item><title>東涌</title><pubDate>Thu, 17 Sep 2026 09:30:00 +0800</pubDate><description><![CDATA[東涌 - 一般監測站： 3 低 - 2026年9月17日 (星期四)]]></description></item>
<item><title>旺角</title><pubDate>Thu, 17 Sep 2026 09:30:00 +0800</pubDate><description><![CDATA[旺角 - 路邊監測站: 8 高 - 2026年9月17日 (星期四)]]></description></item>
</channel></rss>`;

describe('aqhiLevelFor', () => {
  it('maps EPD health-risk bands (Low 1-3, Moderate 4-7, High 8-10, Very High 10+)', () => {
    // Boundary values verified against the live feed's own labels:
    // value 3 published as "Low", 4 as "Moderate".
    expect(aqhiLevelFor(1)).toBe('low');
    expect(aqhiLevelFor(3)).toBe('low');
    expect(aqhiLevelFor(4)).toBe('moderate');
    expect(aqhiLevelFor(7)).toBe('moderate');
    expect(aqhiLevelFor(8)).toBe('high');
    expect(aqhiLevelFor(10)).toBe('high');
    expect(aqhiLevelFor(11)).toBe('veryHigh');
    expect(aqhiLevelFor(15)).toBe('veryHigh');
  });
});

describe('parseAqhiRss', () => {
  it('parses EN feed items into per-station values', () => {
    const { data, warnings } = parseAqhiRss(EN_FEED);
    expect(warnings).toEqual([]);
    expect(data).toEqual([
      { station: 'Central/Western', value: 5 },
      { station: 'Southern', value: 4 },
      { station: 'Tung Chung', value: 3 },
      { station: 'Central', value: 6 },
      { station: 'Mong Kok', value: 8 },
    ]);
  });

  it('parses TC feed items (中 level token, full-width colon)', () => {
    const { data, warnings } = parseAqhiRss(TC_FEED);
    expect(warnings).toEqual([]);
    expect(data).toEqual([
      { station: '中西區', value: 5 },
      { station: '東涌', value: 3 },
      { station: '旺角', value: 8 },
    ]);
  });

  it('skips unparseable items with a warning instead of failing', () => {
    const broken = EN_FEED.replace(
      /<item><title>Tung Chung[\s\S]*?<\/item>/,
      '<item><title>Tung Chung</title><description><![CDATA[Tung Chung - General Stations: N/A]]></description></item>',
    );
    const { data, warnings } = parseAqhiRss(broken);
    expect(data.map(d => d.station)).toEqual(['Central/Western', 'Southern', 'Central', 'Mong Kok']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Tung Chung');
  });

  it('returns empty data for garbage input', () => {
    const { data, warnings } = parseAqhiRss('<html>not an rss feed</html>');
    expect(data).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

describe('findNearestAqhiStation', () => {
  it('covers all 18 EPD stations (15 general + 3 roadside) with both languages', () => {
    expect(EPD_AQHI_STATIONS).toHaveLength(18);
    expect(EPD_AQHI_STATIONS.filter(s => s.type === 'roadside')).toHaveLength(3);
    for (const s of EPD_AQHI_STATIONS) {
      expect(s.en).toBeTruthy();
      expect(s.tc).toBeTruthy();
    }
  });

  it('picks Mong Kok for a user in central Kowloon', () => {
    const nearest = findNearestAqhiStation(22.3180, 114.1700, 'en');
    expect(nearest?.title).toBe('Mong Kok');
  });

  it('returns the TC title under tc', () => {
    const nearest = findNearestAqhiStation(22.3180, 114.1700, 'tc');
    expect(nearest?.title).toBe('旺角');
  });
});

describe('getHKOAQHI', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFeedResponse(xml: string) {
    return vi.fn().mockResolvedValue(new Response(xml, { status: 200 }));
  }

  it('resolves the nearest station reading from the EN feed', async () => {
    vi.stubGlobal('fetch', mockFeedResponse(EN_FEED));
    // Mong Kok coords → roadside station, index 8 → high.
    const reading = await getHKOAQHI('en', 22.3180, 114.1700);
    expect(reading).toEqual({ index: 8, level: 'high', station: 'Mong Kok' });
    // Proxied same-origin path, not the blocked cross-origin feed URL.
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/aqhi-rss/aqhi_ind_rss_Eng.xml');
  });

  it('resolves the TC station title under tc', async () => {
    vi.stubGlobal('fetch', mockFeedResponse(TC_FEED));
    const reading = await getHKOAQHI('tc', 22.3180, 114.1700);
    expect(reading).toEqual({ index: 8, level: 'high', station: '旺角' });
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/aqhi-rss/aqhi_ind_rss_ChT.xml');
  });

  it('returns null when the fetch fails (silent degradation)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const reading = await getHKOAQHI('en', 22.3180, 114.1700);
    expect(reading).toBeNull();
  });

  it('returns null when the feed parses but no station matches', async () => {
    vi.stubGlobal('fetch', mockFeedResponse(EN_FEED.replace(/Mong Kok/g, 'Unknown Station')));
    const reading = await getHKOAQHI('en', 22.3180, 114.1700);
    expect(reading).toBeNull();
  });
});
