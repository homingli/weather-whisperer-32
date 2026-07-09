/** HKO station and district name translations (English ↔ Traditional Chinese) */

export const STATION_TC_TO_EN: Record<string, string> = {
  "京士柏": "King's Park",
  "香港天文台": "Hong Kong Observatory",
  "黃竹坑": "Wong Chuk Hang",
  "打鼓嶺": "Ta Kwu Ling",
  "流浮山": "Lau Fau Shan",
  "大埔": "Tai Po",
  "沙田": "Sha Tin",
  "屯門": "Tuen Mun",
  "將軍澳": "Tseung Kwan O",
  "西貢": "Sai Kung",
  "長洲": "Cheung Chau",
  "赤鱲角": "Chek Lap Kok",
  "青衣": "Tsing Yi",
  "石崗": "Shek Kong",
  "荃灣可觀": "Tsuen Wan Ho Koon",
  "荃灣城門谷": "Tsuen Wan Shing Mun Valley",
  "香港公園": "Hong Kong Park",
  "筲箕灣": "Shau Kei Wan",
  "九龍城": "Kowloon City",
  "跑馬地": "Happy Valley",
  "黃大仙": "Wong Tai Sin",
  "赤柱": "Stanley",
  "觀塘": "Kwun Tong",
  "深水埗": "Sham Shui Po",
  "啟德跑道公園": "Kai Tak Runway Park",
  "元朗公園": "Yuen Long Park",
  "大美督": "Tai Mei Tuk",
};

export const STATION_EN_TO_TC: Record<string, string> = Object.fromEntries(
  Object.entries(STATION_TC_TO_EN).map(([tc, en]) => [en, tc])
);

export const DISTRICT_TC_TO_EN: Record<string, string> = {
  "中西區": "Central & Western District",
  "東區": "Eastern District",
  "葵青": "Kwai Tsing",
  "離島區": "Islands District",
  "北區": "North District",
  "西貢": "Sai Kung",
  "沙田": "Sha Tin",
  "南區": "Southern District",
  "大埔": "Tai Po",
  "荃灣": "Tsuen Wan",
  "屯門": "Tuen Mun",
  "灣仔": "Wan Chai",
  "元朗": "Yuen Long",
  "油尖旺": "Yau Tsim Mong",
  "深水埗": "Sham Shui Po",
  "九龍城": "Kowloon City",
  "黃大仙": "Wong Tai Sin",
  "觀塘": "Kwun Tong",
};

export const DISTRICT_EN_TO_TC: Record<string, string> = Object.fromEntries(
  Object.entries(DISTRICT_TC_TO_EN).map(([tc, en]) => [en, tc])
);

/** Translate station name between English and Traditional Chinese */
export function translateStationName(name: string, lang: 'en' | 'tc'): string {
  if (lang === 'tc') {
    return STATION_EN_TO_TC[name] || name;
  }
  return STATION_TC_TO_EN[name] || name;
}

/** Translate district name between English and Traditional Chinese */
export function translateDistrictName(name: string, lang: 'en' | 'tc'): string {
  if (lang === 'tc') {
    return DISTRICT_EN_TO_TC[name] || name;
  }
  return DISTRICT_TC_TO_EN[name] || name;
}

/** Translate PSR labels between English and Traditional Chinese */
export function translatePsr(psr: string | undefined, lang: 'en' | 'tc'): string | null {
  if (!psr) return null;
  const labels: Record<string, Record<string, string>> = {
    en: {
      'Low': 'Low',
      'Med Low': 'Med Low',
      'Med': 'Med',
      'Med High': 'Med High',
      'High': 'High',
    },
    tc: {
      'Low': '低',
      'Med Low': '中低',
      'Med': '中',
      'Med High': '中高',
      'High': '高',
    }
  };
  return labels[lang]?.[psr] || psr;
}
