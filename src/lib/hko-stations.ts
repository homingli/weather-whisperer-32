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

// HKO weather station coordinates (English names)
export const HKO_STATIONS_EN: Record<string, { lat: number; lon: number }> = {
  "King's Park": { lat: 22.3119, lon: 114.1728 },
  "Hong Kong Observatory": { lat: 22.3019, lon: 114.1742 },
  "Wong Chuk Hang": { lat: 22.2478, lon: 114.1736 },
  "Ta Kwu Ling": { lat: 22.5288, lon: 114.1567 },
  "Lau Fau Shan": { lat: 22.4686, lon: 113.9844 },
  "Tai Po": { lat: 22.4444, lon: 114.1644 },
  "Sha Tin": { lat: 22.4025, lon: 114.2100 },
  "Tuen Mun": { lat: 22.3858, lon: 113.9639 },
  "Tseung Kwan O": { lat: 22.3158, lon: 114.2556 },
  "Sai Kung": { lat: 22.3769, lon: 114.2744 },
  "Cheung Chau": { lat: 22.2011, lon: 114.0267 },
  "Chek Lap Kok": { lat: 22.3089, lon: 113.9219 },
  "Tsing Yi": { lat: 22.3442, lon: 114.1100 },
  "Shek Kong": { lat: 22.4361, lon: 114.0847 },
  "Tsuen Wan Ho Koon": { lat: 22.3839, lon: 114.1078 },
  "Tsuen Wan Shing Mun Valley": { lat: 22.3756, lon: 114.1247 },
  "Hong Kong Park": { lat: 22.2778, lon: 114.1617 },
  "Shau Kei Wan": { lat: 22.2794, lon: 114.2286 },
  "Kowloon City": { lat: 22.3283, lon: 114.1917 },
  "Happy Valley": { lat: 22.2708, lon: 114.1831 },
  "Wong Tai Sin": { lat: 22.3422, lon: 114.1931 },
  "Stanley": { lat: 22.2186, lon: 114.2119 },
  "Kwun Tong": { lat: 22.3119, lon: 114.2236 },
  "Sham Shui Po": { lat: 22.3303, lon: 114.1594 },
  "Kai Tak Runway Park": { lat: 22.3050, lon: 114.2133 },
  "Yuen Long Park": { lat: 22.4444, lon: 114.0222 },
  "Tai Mei Tuk": { lat: 22.4750, lon: 114.2369 },
};

// HKO weather station coordinates (Traditional Chinese names)
export const HKO_STATIONS_TC: Record<string, { lat: number; lon: number }> = {
  "京士柏": { lat: 22.3119, lon: 114.1728 },
  "香港天文台": { lat: 22.3019, lon: 114.1742 },
  "黃竹坑": { lat: 22.2478, lon: 114.1736 },
  "打鼓嶺": { lat: 22.5288, lon: 114.1567 },
  "流浮山": { lat: 22.4686, lon: 113.9844 },
  "大埔": { lat: 22.4444, lon: 114.1644 },
  "沙田": { lat: 22.4025, lon: 114.2100 },
  "屯門": { lat: 22.3858, lon: 113.9639 },
  "將軍澳": { lat: 22.3158, lon: 114.2556 },
  "西貢": { lat: 22.3769, lon: 114.2744 },
  "長洲": { lat: 22.2011, lon: 114.0267 },
  "赤鱲角": { lat: 22.3089, lon: 113.9219 },
  "青衣": { lat: 22.3442, lon: 114.1100 },
  "石崗": { lat: 22.4361, lon: 114.0847 },
  "荃灣可觀": { lat: 22.3839, lon: 114.1078 },
  "荃灣城門谷": { lat: 22.3756, lon: 114.1247 },
  "香港公園": { lat: 22.2778, lon: 114.1617 },
  "筲箕灣": { lat: 22.2794, lon: 114.2286 },
  "九龍城": { lat: 22.3283, lon: 114.1917 },
  "跑馬地": { lat: 22.2708, lon: 114.1831 },
  "黃大仙": { lat: 22.3422, lon: 114.1931 },
  "赤柱": { lat: 22.2186, lon: 114.2119 },
  "觀塘": { lat: 22.3119, lon: 114.2236 },
  "深水埗": { lat: 22.3303, lon: 114.1594 },
  "啟德跑道公園": { lat: 22.3050, lon: 114.2133 },
  "元朗公園": { lat: 22.4444, lon: 114.0222 },
  "大美督": { lat: 22.4750, lon: 114.2369 },
};

// HKO rainfall district coordinates (English names)
export const HKO_DISTRICTS_EN: Record<string, { lat: number; lon: number }> = {
  "Central & Western District": { lat: 22.2855, lon: 114.1422 },
  "Eastern District": { lat: 22.2842, lon: 114.2244 },
  "Kwai Tsing": { lat: 22.3544, lon: 114.1256 },
  "Islands District": { lat: 22.2611, lon: 113.9456 },
  "North District": { lat: 22.4944, lon: 114.1383 },
  "Sai Kung": { lat: 22.3819, lon: 114.2708 },
  "Sha Tin": { lat: 22.3872, lon: 114.1953 },
  "Southern District": { lat: 22.2458, lon: 114.1556 },
  "Tai Po": { lat: 22.4508, lon: 114.1644 },
  "Tsuen Wan": { lat: 22.3711, lon: 114.1147 },
  "Tuen Mun": { lat: 22.3917, lon: 113.9767 },
  "Wan Chai": { lat: 22.2783, lon: 114.1747 },
  "Yuen Long": { lat: 22.4444, lon: 114.0222 },
  "Yau Tsim Mong": { lat: 22.3183, lon: 114.1694 },
  "Sham Shui Po": { lat: 22.3308, lon: 114.1592 },
  "Kowloon City": { lat: 22.3286, lon: 114.1917 },
  "Wong Tai Sin": { lat: 22.3422, lon: 114.1933 },
  "Kwun Tong": { lat: 22.3119, lon: 114.2236 },
};

// HKO rainfall district coordinates (Traditional Chinese names)
export const HKO_DISTRICTS_TC: Record<string, { lat: number; lon: number }> = {
  "中西區": { lat: 22.2855, lon: 114.1422 },
  "東區": { lat: 22.2842, lon: 114.2244 },
  "葵青": { lat: 22.3544, lon: 114.1256 },
  "離島區": { lat: 22.2611, lon: 113.9456 },
  "北區": { lat: 22.4944, lon: 114.1383 },
  "西貢": { lat: 22.3819, lon: 114.2708 },
  "沙田": { lat: 22.3872, lon: 114.1953 },
  "南區": { lat: 22.2458, lon: 114.1556 },
  "大埔": { lat: 22.4508, lon: 114.1644 },
  "荃灣": { lat: 22.3711, lon: 114.1147 },
  "屯門": { lat: 22.3917, lon: 113.9767 },
  "灣仔": { lat: 22.2783, lon: 114.1747 },
  "元朗": { lat: 22.4444, lon: 114.0222 },
  "油尖旺": { lat: 22.3183, lon: 114.1694 },
  "深水埗": { lat: 22.3308, lon: 114.1592 },
  "九龍城": { lat: 22.3286, lon: 114.1917 },
  "黃大仙": { lat: 22.3422, lon: 114.1933 },
  "觀塘": { lat: 22.3119, lon: 114.2236 },
};

// Find the nearest station to given coordinates
export function findNearestStation(
  lat: number,
  lon: number,
  lang: 'en' | 'tc' = 'en'
): { name: string; distance: number } | null {
  const stations = lang === 'tc' ? HKO_STATIONS_TC : HKO_STATIONS_EN;
  let nearestStation: string | null = null;
  let minDistance = Infinity;

  for (const [name, coords] of Object.entries(stations)) {
    const distance = getDistanceFromLatLon(lat, lon, coords.lat, coords.lon);
    if (distance < minDistance) {
      minDistance = distance;
      nearestStation = name;
    }
  }

  return nearestStation ? { name: nearestStation, distance: minDistance } : null;
}

// Find the nearest district to given coordinates
export function findNearestDistrict(
  lat: number,
  lon: number,
  lang: 'en' | 'tc' = 'en'
): { name: string; distance: number } | null {
  const districts = lang === 'tc' ? HKO_DISTRICTS_TC : HKO_DISTRICTS_EN;
  let nearestDistrict: string | null = null;
  let minDistance = Infinity;

  for (const [name, coords] of Object.entries(districts)) {
    const distance = getDistanceFromLatLon(lat, lon, coords.lat, coords.lon);
    if (distance < minDistance) {
      minDistance = distance;
      nearestDistrict = name;
    }
  }

  return nearestDistrict ? { name: nearestDistrict, distance: minDistance } : null;
}

// Get coordinates for a station name
export function getStationCoordinates(
  stationName: string,
  lang: 'en' | 'tc' = 'en'
): { lat: number; lon: number } | null {
  const stations = lang === 'tc' ? HKO_STATIONS_TC : HKO_STATIONS_EN;
  return stations[stationName] || null;
}

// Get coordinates for a district name
export function getDistrictCoordinates(
  districtName: string,
  lang: 'en' | 'tc' = 'en'
): { lat: number; lon: number } | null {
  const districts = lang === 'tc' ? HKO_DISTRICTS_TC : HKO_DISTRICTS_EN;
  return districts[districtName] || null;
}
