/** HKO weather station and district coordinate mappings */

/** Haversine distance between two coordinates in km (also used by the
 *  EPD AQHI nearest-station lookup in hko-aqhi.ts) */
export function getDistanceFromLatLon(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * HKO places keyed by English name, each carrying its Traditional Chinese
 * name and coordinates. This is the single source for both languages: the
 * TC↔EN translation maps in hko-translations.ts are derived from these
 * tables, so a rename or coordinate fix is a one-line edit here.
 */
export interface HkoPlace {
  lat: number;
  lon: number;
  tc: string;
}

// HKO weather stations
export const HKO_STATIONS: Record<string, HkoPlace> = {
  "King's Park": { lat: 22.3119, lon: 114.1728, tc: "京士柏" },
  "Hong Kong Observatory": { lat: 22.3019, lon: 114.1742, tc: "香港天文台" },
  "Wong Chuk Hang": { lat: 22.2478, lon: 114.1736, tc: "黃竹坑" },
  "Ta Kwu Ling": { lat: 22.5288, lon: 114.1567, tc: "打鼓嶺" },
  "Lau Fau Shan": { lat: 22.4686, lon: 113.9844, tc: "流浮山" },
  "Tai Po": { lat: 22.4444, lon: 114.1644, tc: "大埔" },
  "Sha Tin": { lat: 22.4025, lon: 114.2100, tc: "沙田" },
  "Tuen Mun": { lat: 22.3858, lon: 113.9639, tc: "屯門" },
  "Tseung Kwan O": { lat: 22.3158, lon: 114.2556, tc: "將軍澳" },
  "Sai Kung": { lat: 22.3769, lon: 114.2744, tc: "西貢" },
  "Cheung Chau": { lat: 22.2011, lon: 114.0267, tc: "長洲" },
  "Chek Lap Kok": { lat: 22.3089, lon: 113.9219, tc: "赤鱲角" },
  "Tsing Yi": { lat: 22.3442, lon: 114.1100, tc: "青衣" },
  "Shek Kong": { lat: 22.4361, lon: 114.0847, tc: "石崗" },
  "Tsuen Wan Ho Koon": { lat: 22.3839, lon: 114.1078, tc: "荃灣可觀" },
  "Tsuen Wan Shing Mun Valley": { lat: 22.3756, lon: 114.1247, tc: "荃灣城門谷" },
  "Hong Kong Park": { lat: 22.2778, lon: 114.1617, tc: "香港公園" },
  "Shau Kei Wan": { lat: 22.2794, lon: 114.2286, tc: "筲箕灣" },
  "Kowloon City": { lat: 22.3283, lon: 114.1917, tc: "九龍城" },
  "Happy Valley": { lat: 22.2708, lon: 114.1831, tc: "跑馬地" },
  "Wong Tai Sin": { lat: 22.3422, lon: 114.1931, tc: "黃大仙" },
  "Stanley": { lat: 22.2186, lon: 114.2119, tc: "赤柱" },
  "Kwun Tong": { lat: 22.3119, lon: 114.2236, tc: "觀塘" },
  "Sham Shui Po": { lat: 22.3303, lon: 114.1594, tc: "深水埗" },
  "Kai Tak Runway Park": { lat: 22.3050, lon: 114.2133, tc: "啟德跑道公園" },
  "Yuen Long Park": { lat: 22.4444, lon: 114.0222, tc: "元朗公園" },
  "Tai Mei Tuk": { lat: 22.4750, lon: 114.2369, tc: "大美督" },
};

// HKO rainfall districts
export const HKO_DISTRICTS: Record<string, HkoPlace> = {
  "Central & Western District": { lat: 22.2855, lon: 114.1422, tc: "中西區" },
  "Eastern District": { lat: 22.2842, lon: 114.2244, tc: "東區" },
  "Kwai Tsing": { lat: 22.3544, lon: 114.1256, tc: "葵青" },
  "Islands District": { lat: 22.2611, lon: 113.9456, tc: "離島區" },
  "North District": { lat: 22.4944, lon: 114.1383, tc: "北區" },
  "Sai Kung": { lat: 22.3819, lon: 114.2708, tc: "西貢" },
  "Sha Tin": { lat: 22.3872, lon: 114.1953, tc: "沙田" },
  "Southern District": { lat: 22.2458, lon: 114.1556, tc: "南區" },
  "Tai Po": { lat: 22.4508, lon: 114.1644, tc: "大埔" },
  "Tsuen Wan": { lat: 22.3711, lon: 114.1147, tc: "荃灣" },
  "Tuen Mun": { lat: 22.3917, lon: 113.9767, tc: "屯門" },
  "Wan Chai": { lat: 22.2783, lon: 114.1747, tc: "灣仔" },
  "Yuen Long": { lat: 22.4444, lon: 114.0222, tc: "元朗" },
  "Yau Tsim Mong": { lat: 22.3183, lon: 114.1694, tc: "油尖旺" },
  "Sham Shui Po": { lat: 22.3308, lon: 114.1592, tc: "深水埗" },
  "Kowloon City": { lat: 22.3286, lon: 114.1917, tc: "九龍城" },
  "Wong Tai Sin": { lat: 22.3422, lon: 114.1933, tc: "黃大仙" },
  "Kwun Tong": { lat: 22.3119, lon: 114.2236, tc: "觀塘" },
};

/** Nearest place in `places` to the given coordinate, reporting the name in
 *  the requested language. */
function findNearest(
  places: Record<string, HkoPlace>,
  lat: number,
  lon: number,
  lang: 'en' | 'tc',
): { name: string; distance: number } | null {
  let nearestName: string | null = null;
  let minDistance = Infinity;

  for (const [en, place] of Object.entries(places)) {
    const distance = getDistanceFromLatLon(lat, lon, place.lat, place.lon);
    if (distance < minDistance) {
      minDistance = distance;
      nearestName = lang === 'tc' ? place.tc : en;
    }
  }

  return nearestName ? { name: nearestName, distance: minDistance } : null;
}

/** Coordinates for a place name, accepted in either language. */
function placeCoordinates(
  places: Record<string, HkoPlace>,
  name: string,
): { lat: number; lon: number } | null {
  if (places[name]) return { lat: places[name].lat, lon: places[name].lon };
  const byTc = Object.values(places).find((p) => p.tc === name);
  return byTc ? { lat: byTc.lat, lon: byTc.lon } : null;
}

// Find the nearest station to given coordinates
export function findNearestStation(
  lat: number,
  lon: number,
  lang: 'en' | 'tc' = 'en'
): { name: string; distance: number } | null {
  return findNearest(HKO_STATIONS, lat, lon, lang);
}

// Find the nearest district to given coordinates
export function findNearestDistrict(
  lat: number,
  lon: number,
  lang: 'en' | 'tc' = 'en'
): { name: string; distance: number } | null {
  return findNearest(HKO_DISTRICTS, lat, lon, lang);
}

// Get coordinates for a station name (either language)
export function getStationCoordinates(
  stationName: string
): { lat: number; lon: number } | null {
  return placeCoordinates(HKO_STATIONS, stationName);
}

// Get coordinates for a district name (either language)
export function getDistrictCoordinates(
  districtName: string
): { lat: number; lon: number } | null {
  return placeCoordinates(HKO_DISTRICTS, districtName);
}
