import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { STORAGE_KEYS } from '@/lib/constants';

export type Language = 'en' | 'tc';

/**
 * Map our short language codes to BCP-47 `lang` values that screen readers
 * and browser TTS engines can recognise. 'tc' is Traditional Chinese as used
 * in Hong Kong; 'en' is generic English.
 */
const HTML_LANG: Record<Language, string> = {
  en: 'en',
  tc: 'zh-Hant-HK',
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, fallback?: string) => string;
}

const VALID_LANGUAGES: ReadonlySet<Language> = new Set<Language>(['en', 'tc']);

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Header
    'hko.name': 'Hong Kong Observatory',
    
    // Weather alerts
    'alerts.title': 'Weather Alerts',
    'alerts.issued': 'Issued',
    'alerts.toast.issued': '{0} now in effect',
    'alerts.toast.cancelled': '{0} cancelled',
    'alerts.toast.view': 'View',

    // Warning names (used for both real HKO warnings and dev-simulated ones;
    // look up via t(`warnings.${code}`, w.name) so unknown codes fall back
    // to the API-provided name).
    'warnings.TC1': 'Standby Signal No. 1',
    'warnings.TC3': 'Strong Wind Signal No. 3',
    'warnings.TC8': 'No. 8 Gale or Storm Signal',
    'warnings.TC8NE': 'No. 8 Northeast Gale or Storm Signal',
    'warnings.TC8SE': 'No. 8 Southeast Gale or Storm Signal',
    'warnings.TC8SW': 'No. 8 Southwest Gale or Storm Signal',
    'warnings.TC8NW': 'No. 8 Northwest Gale or Storm Signal',
    'warnings.TC9': 'No. 9 Increasing Gale or Storm Signal',
    'warnings.TC10': 'No. 10 Hurricane Signal',
    'warnings.WRAIN': 'Amber Rainstorm Warning',
    'warnings.WRAINR': 'Red Rainstorm Warning',
    'warnings.WRAINB': 'Black Rainstorm Warning',
    'warnings.HKA': 'Very Hot Weather Warning',
    'warnings.COLD': 'Cold Weather Warning',
    'warnings.TS': 'Thunderstorm Warning',
    'warnings.FL': 'Frost Warning',
    'warnings.MW': 'Strong Monsoon Signal',
    'warnings.LM': 'Landslip Warning',
    'warnings.FOG': 'Fog Warning',
    'warnings.WFIRE': 'Fire Danger Warning',
    'warnings.WFNTSA': 'New Territories Northern Waters Flooding',

    // Umbrella section
    'umbrella.question': 'DO I NEED AN UMBRELLA TODAY?',
    'umbrella.yes': 'YES',
    'umbrella.no': 'NO',
    'umbrella.raining': "It's currently raining",
    'umbrella.chanceAt': '{0}% chance of rain at {1}',
    'umbrella.label': 'Umbrella',
    
    // Hourly forecast
    'hourly.title': 'HOURLY FORECAST',
    'hourly.now': 'Now',
    'hourly.temperature': 'Temperature',
    'hourly.rainChance': 'Rain Chance',
    'hourly.chartLabel': 'Hourly temperature and rain probability chart',
    
    // Daily forecast
    'daily.title': '7-DAY FORECAST',
    'daily.today': 'Today',
    'daily.tomorrow': 'Tomorrow',
    'daily.low': 'Low',
    'daily.high': 'High',
    'daily.precip': 'Precip.',
    'daily.chartLabel': '7-day temperature range and precipitation chart',
    'daily.sunrise': 'Sunrise',
    'daily.sunset': 'Sunset',

    // Temperature caption under the hero (today's L/H + short-term trend)
    'temp.hi': 'H',
    'temp.lo': 'L',
    'trend.warmer': '{0}° warmer by {1}',
    'trend.cooler': '{0}° cooler by {1}',
    'trend.steady': 'no change',

    // Hero / editorial labels
    'header.dailyEdition': 'Daily Edition',

    // Weather condition descriptions (WMO codes)
    'weather.desc.clearSky': 'Clear sky',
    'weather.desc.mainlyClear': 'Mainly clear',
    'weather.desc.partlyCloudy': 'Partly cloudy',
    'weather.desc.cloudy': 'Cloudy',
    'weather.desc.overcast': 'Overcast',
    'weather.desc.foggy': 'Foggy',
    'weather.desc.depositingRimeFog': 'Depositing rime fog',
    'weather.desc.lightDrizzle': 'Light drizzle',
    'weather.desc.moderateDrizzle': 'Moderate drizzle',
    'weather.desc.denseDrizzle': 'Dense drizzle',
    'weather.desc.freezingDrizzle': 'Freezing drizzle',
    'weather.desc.denseFreezingDrizzle': 'Dense freezing drizzle',
    'weather.desc.lightRain': 'Light rain',
    'weather.desc.moderateRain': 'Moderate rain',
    'weather.desc.heavyRain': 'Heavy rain',
    'weather.desc.freezingRain': 'Freezing rain',
    'weather.desc.heavyFreezingRain': 'Heavy freezing rain',
    'weather.desc.slightSnow': 'Slight snow',
    'weather.desc.moderateSnow': 'Moderate snow',
    'weather.desc.heavySnow': 'Heavy snow',
    'weather.desc.snowGrains': 'Snow grains',
    'weather.desc.slightRainShowers': 'Slight rain showers',
    'weather.desc.moderateRainShowers': 'Moderate rain showers',
    'weather.desc.violentRainShowers': 'Violent rain showers',
    'weather.desc.slightSnowShowers': 'Slight snow showers',
    'weather.desc.heavySnowShowers': 'Heavy snow showers',
    'weather.desc.thunderstorm': 'Thunderstorm',
    'weather.desc.thunderstormWithHail': 'Thunderstorm with hail',
    'weather.desc.thunderstormWithHeavyHail': 'Thunderstorm with heavy hail',
    'weather.desc.unknown': 'Unknown',

    // HKO icon descriptions (50-65, 70-77, 80-93). Codes 60/61/62/64 and
    // 75/76/77 reuse weather.desc.* keys (wording matches WMO); see
    // Keep the mapping aligned with the HKO icon taxonomy.
    'hko.desc.sunny': 'Sunny',
    'hko.desc.sunnyPeriods': 'Sunny periods',
    'hko.desc.sunnyIntervals': 'Sunny intervals',
    'hko.desc.sunnyPeriodsFewShowers': 'Sunny periods with a few showers',
    'hko.desc.sunnyIntervalsShowers': 'Sunny intervals with showers',
    'hko.desc.rain': 'Rain',
    'hko.desc.thunderstorms': 'Thunderstorms',
    'hko.desc.clear': 'Clear',
    'hko.desc.clearPeriods': 'Clear periods',
    'hko.desc.clearIntervals': 'Clear intervals',
    'hko.desc.clearPeriodsFewShowers': 'Clear periods with a few showers',
    'hko.desc.clearIntervalsShowers': 'Clear intervals with showers',
    'hko.desc.windy': 'Windy',
    'hko.desc.dry': 'Dry',
    'hko.desc.humid': 'Humid',
    'hko.desc.fog': 'Fog',
    'hko.desc.mist': 'Mist',
    'hko.desc.haze': 'Haze',
    'hko.desc.hot': 'Hot',
    'hko.desc.warm': 'Warm',
    'hko.desc.cool': 'Cool',
    'hko.desc.cold': 'Cold',

    // Sunrise / sunset countdown
    'sun.now': 'now',
    'sun.inHoursMinutes': 'in {0}h {1}m',
    'sun.inHours': 'in {0}h',
    'sun.inMinutes': 'in {0}m',
    // Sun-cycle progress strip (CurrentWeather)
    'sun.daylight': 'Daylight',
    'sun.night': 'Night',
    
    // City search
    'search.placeholder': 'Search for a city...',
    'search.searching': 'Searching...',
    'search.noResults': 'No cities found',
    'search.city': 'Search city',
    'search.useLocation': 'Use current location',
    'search.locationUpdated': 'Location updated to {0}',
    'search.locationError': 'Could not get your location. Please check permissions.',
    
    // Loading states
    'loading.fetchingData': 'Loading Weather Data...',
    'loading.findingLocation': 'Finding your location...',
    'loading.allowLocation': 'Please allow location access for local weather',
    'loading.welcome': 'Welcome to Weather',
    'loading.searchPrompt': 'Search for a city to see current weather and forecasts',
    'loading.failed': 'Failed to load weather data',
    'loading.tryAgain': 'Please try again later',
    
    // Fallback banners
    'fallback.hkoTitle': 'Open-Meteo API Offline',
    'fallback.hkoDesc': 'Open-Meteo weather API is currently experiencing connection issues. Showing live weather data from the Hong Kong Observatory instead. Check latest status: https://status.open-meteo.com/',
    'fallback.cacheTitle': 'Weather Service Offline',
    'fallback.cacheDesc': 'All weather APIs are currently offline. Showing cached weather data from your last successful load.',

    // Data
    'data.refresh': 'Refresh Data',
    'data.refreshing': 'Refreshing weather data...',
    'data.refreshed': 'Weather data refreshed',
    'data.refreshFailed': 'Failed to refresh data',
    'data.usingCached': 'Showing cached data',
    'data.partialData': 'Showing partial data only with {0}',
    'data.partialDataNoSource': 'Showing partial data only',
    'data.partialDataDesc': 'One or more data sources could not be reached. Forecasts and warnings may be incomplete.',
    'data.offline': 'Currently offline',
    'data.offlineWithTs': 'Currently offline: showing cached data from {0}',
    'data.offlineDesc': 'Weather services are unreachable. The display may not reflect current conditions.',
    'data.refetchLive': 'Refetch live data',

    // Weather source
    'source.openMeteo': 'Open-Meteo',
    'source.openMeteoDesc': 'Global weather data',
    'source.hko': 'HK Observatory',
    'source.hkoDesc': 'Hong Kong only',
    'source.poweredByBoth': 'Data from {0} & {1}',
    'source.poweredBy': 'Data from {0}',
    
    // Language
    'language.en': 'English',
    'language.tc': '繁體中文',

    // Units (metric ↔ US)
    'settings.units': 'Units',
    'settings.metric': 'Metric',
    'settings.us': 'US',
    'unit.mph': 'mph',
    'unit.in': 'in',

    // Text size (root font-size scale)
    'settings.fontSize': 'Text size',
    'settings.fontSize.small': 'Small',
    'settings.fontSize.medium': 'Medium',
    'settings.fontSize.large': 'Large',

    // Current weather
    'weather.feelsLike': 'Feels like',
    'weather.wind': 'Wind',
    'weather.windSpeed': 'Wind Speed',
    'weather.windDirection': 'Wind Direction',
    'weather.humidity': 'Humidity',
    'weather.uvIndex': 'UV Index',
    // UV exposure band labels (WHO UV index scale).
    'uv.low': 'Low',
    'uv.moderate': 'Moderate',
    'uv.high': 'High',
    'uv.veryHigh': 'Very High',
    'uv.extreme': 'Extreme',
    'uv.unavailable': 'unavailable',
    // Air Quality Health Index (EPD feed, HK locations only).
    'weather.aqhi': 'Air Quality (AQHI)',
    'aqhi.low': 'Low',
    'aqhi.moderate': 'Moderate',
    'aqhi.high': 'High',
    'aqhi.veryHigh': 'Very High',
    'unit.kmh': 'km/h',
    // Quiet shelf — aria-label on the icon row holding distilled metrics.
    'quiet.shelfLabel': 'Metrics needing no attention',
    
    // Nowcast Map
    'nowcast.title': 'Rain Cloud Nowcast',
    'nowcast.subtitle': 'Is the rain coming in the next hour? Shall I stay or shall I leave?',
    'nowcast.load': 'Load Map (~2.7MB)',
    'nowcast.downloading': 'Downloading nowcast data...',
    'nowcast.error': 'Could not load gridded rainfall data.',
    'nowcast.view': 'View Rainfall Map',
    'nowcast.desc': 'Load the real-time gridded rainfall nowcast to see if rain is approaching in the next 2 hours.',
    'nowcast.legend': 'Rainfall (mm)',
    'nowcast.updated': 'Updated: {0}',
    'nowcast.mapLabel': 'Gridded rainfall nowcast map',
    'nowcast.play': 'Play timeline',
    'nowcast.pause': 'Pause timeline',
    'nowcast.slider': 'Rainfall timeline',
    'nowcast.stayOrGo': 'STAY OR GO',
    'nowcast.forecastStep': 'Forecast Step',
    'nowcast.switchBasemap': 'Switch basemap (current: {0})',
    'nowcast.refreshNowcast': 'Refresh gridded nowcast',
    'nowcast.loadFailed': 'Failed to load data',
    'nowcast.tryAgain': 'Try Again',
    'nowcast.basemapLight': 'light',
    'nowcast.basemapDark': 'dark',
    // Background refetch failed but the previous grid is still on screen.
    // Shown as a small pill so the map underneath stays interactive.
    'nowcast.staleTitle': 'Using last known nowcast',
    'nowcast.staleDesc': 'Refresh failed. Showing the previous forecast — try again when connection is stable.',
    'nowcast.loadingSlow': 'Slow connection — fetching nowcast data',

    // MSC (Vancouver) nowcast — GeoMet WMS. Step controls / loading / error
    // states reuse nowcast.*; these keys are MSC-specific (D-006).
    'msc.legendTitle': 'Precipitation intensity',
    'msc.intensityLow': 'Low',
    'msc.intensityModerate': 'Moderate',
    'msc.intensityHigh': 'High',
    'msc.noPrecipitation': 'No precipitation in forecast',
    'msc.usingLastAnalysis': 'Using last analysis at {0}',

    // Wind direction (aria-label on the rotating arrow SVG)
    'weather.windDirAria': 'Wind direction toward {0}° {1}',

    // Settings menu
    'settings.label': 'Settings',

    // Hourly / daily chart kickers
    'hourly.nextNHours': 'The next {0} hours',
    'daily.lookAhead': 'A look ahead',

    // 404 page
    'notFound.code': '404',
    'notFound.title': 'Oops! Page not found',
    'notFound.returnHome': 'Return to Home',

    // PWA install button (visible label)
    'pwa.install': 'Install',

    // Share forecast (ShareForecastButton / share-forecast.ts) — compose the
    // upcoming days into a message the user can send to friends.
    'share.forecast': 'Share forecast',
    'share.title': 'Weather outlook',
    'share.header': 'Weather in {0} for the coming days:',
    'share.rainChance': '{0}% rain',
    'share.copied': 'Forecast copied — paste it to your friends',
    'share.copyFailed': 'Could not copy the forecast',

    // Rain-start banner (HKO nowcast 0–2 h + Open-Meteo beyond; see
    // RainStartBanner / rain-start.ts). Open-Meteo segments are city-scale
    // (~8 km cells), so they carry the city-wide qualifier.
    'rainstart.now': 'Raining now',
    'rainstart.nowUntil': 'Raining now · easing around {0}',
    'rainstart.expectedIn': 'Rain expected around {0} · {1}',
    // Screen-reader twin of expectedIn without the per-minute countdown —
    // live-region content must stay stable across minute ticks.
    'rainstart.expectedAt': 'Rain expected around {0}',
    'rainstart.none': 'No rain expected in the next {0} h',
    'rainstart.citywide': 'city-wide forecast',
    'rainstart.inMinutes': 'in ~{0} min',
    'rainstart.inHours': 'in ~{0} h',
    'rainstart.inHoursMin': 'in ~{0} h {1} min',

    // At-a-glance rain chip — jumps to the nowcast pane (see AtAGlance).
    'glance.rainAria': 'Rain chance {0}%. View the rainfall nowcast map.',
    'glance.rainTitle': 'View rainfall nowcast',
  },
  tc: {
    // Header
    'hko.name': '香港天文台',
    
    // Weather alerts
    'alerts.title': '天氣警告',
    'alerts.issued': '發出時間',
    'alerts.toast.issued': '{0} 現正生效',
    'alerts.toast.cancelled': '{0} 已經取消',
    'alerts.toast.view': '查看',

    // Warning names (used for both real HKO warnings and dev-simulated ones;
    // look up via t(`warnings.${code}`, w.name) so unknown codes fall back
    // to the API-provided name).
    'warnings.TC1': '一號戒備信號',
    'warnings.TC3': '三號強風信號',
    'warnings.TC8': '八號烈風或暴風信號',
    'warnings.TC8NE': '八號東北烈風或暴風信號',
    'warnings.TC8SE': '八號東南烈風或暴風信號',
    'warnings.TC8SW': '八號西南烈風或暴風信號',
    'warnings.TC8NW': '八號西北烈風或暴風信號',
    'warnings.TC9': '九號烈風或暴風增強信號',
    'warnings.TC10': '十號颶風信號',
    'warnings.WRAIN': '黃色暴雨警告信號',
    'warnings.WRAINR': '紅色暴雨警告信號',
    'warnings.WRAINB': '黑色暴雨警告信號',
    'warnings.HKA': '酷熱天氣警告',
    'warnings.COLD': '寒冷天氣警告',
    'warnings.TS': '雷暴警告',
    'warnings.FL': '霜凍警告',
    'warnings.MW': '強烈季候風信號',
    'warnings.LM': '山泥傾瀉警告',
    'warnings.FOG': '霧警告',
    'warnings.WFIRE': '火災危險警告',
    'warnings.WFNTSA': '新界北部水浸特別報告',

    // Umbrella section
    'umbrella.question': '今日需要帶雨傘嗎？',
    'umbrella.yes': '需要',
    'umbrella.no': '不需要',
    'umbrella.raining': '現正下雨',
    'umbrella.chanceAt': '{1}有{0}%機會下雨',
    'umbrella.label': '雨傘',
    
    // Hourly forecast
    'hourly.title': '每小時預報',
    'hourly.now': '現在',
    'hourly.temperature': '溫度',
    'hourly.rainChance': '降雨機率',
    'hourly.chartLabel': '每小時溫度與降雨機率圖表',
    
    // Daily forecast
    'daily.title': '7日天氣預報',
    'daily.today': '今日',
    'daily.tomorrow': '明日',
    'daily.low': '最低',
    'daily.high': '最高',
    'daily.precip': '降雨量',
    'daily.sunrise': '日出',
    'daily.sunset': '日落',
    'daily.chartLabel': '七日溫度範圍與降雨量圖表',

    // Temperature caption under the hero (today's L/H + short-term trend)
    'temp.hi': '高',
    'temp.lo': '低',
    'trend.warmer': '至 {1} 升 {0}°',
    'trend.cooler': '至 {1} 降 {0}°',
    'trend.steady': '無變化',

    // Hero / editorial labels
    'header.dailyEdition': '每日天氣',

    // Weather condition descriptions (WMO codes)
    'weather.desc.clearSky': '晴朗',
    'weather.desc.mainlyClear': '大致晴朗',
    'weather.desc.partlyCloudy': '局部多雲',
    'weather.desc.cloudy': '多雲',
    'weather.desc.overcast': '多雲',
    'weather.desc.foggy': '有霧',
    'weather.desc.depositingRimeFog': '霧淞',
    'weather.desc.lightDrizzle': '毛毛雨',
    'weather.desc.moderateDrizzle': '小雨',
    'weather.desc.denseDrizzle': '濃毛毛雨',
    'weather.desc.freezingDrizzle': '凍毛毛雨',
    'weather.desc.denseFreezingDrizzle': '濃凍毛毛雨',
    'weather.desc.lightRain': '微雨',
    'weather.desc.moderateRain': '中雨',
    'weather.desc.heavyRain': '大雨',
    'weather.desc.freezingRain': '凍雨',
    'weather.desc.heavyFreezingRain': '大雨兼凍雨',
    'weather.desc.slightSnow': '小雪',
    'weather.desc.moderateSnow': '中雪',
    'weather.desc.heavySnow': '大雪',
    'weather.desc.snowGrains': '雪粒',
    'weather.desc.slightRainShowers': '小陣雨',
    'weather.desc.moderateRainShowers': '中陣雨',
    'weather.desc.violentRainShowers': '猛烈陣雨',
    'weather.desc.slightSnowShowers': '小陣雪',
    'weather.desc.heavySnowShowers': '大陣雪',
    'weather.desc.thunderstorm': '雷暴',
    'weather.desc.thunderstormWithHail': '雷暴夾冰雹',
    'weather.desc.thunderstormWithHeavyHail': '強雷暴夾冰雹',
    'weather.desc.unknown': '未知',

    // HKO icon descriptions (50-65, 70-77, 80-93). Codes that share
    // wording with WMO use the weather.desc.* keys; see
    // TC phrasing follows HK conventions
    // (天晴 / 多雲 / 密雲 / 轉雨 etc.) so the headline reads naturally to HK
    // users. Day/night parallels mirror each other (50 ↔ 70, 51 ↔ 71, etc.)
    // so the nighttime wording reuses the daytime vocabulary.
    'hko.desc.sunny': '天晴',
    'hko.desc.sunnyPeriods': '短暫陽光',
    'hko.desc.sunnyIntervals': '部分時間有陽光',
    'hko.desc.sunnyPeriodsFewShowers': '短暫陽光，局部有驟雨',
    'hko.desc.sunnyIntervalsShowers': '陽光驟雨',
    'hko.desc.rain': '雨',
    'hko.desc.thunderstorms': '雷暴',
    'hko.desc.clear': '天晴',
    'hko.desc.clearPeriods': '短暫天晴',
    'hko.desc.clearIntervals': '部分時間天晴',
    'hko.desc.clearPeriodsFewShowers': '短暫天晴，局部有驟雨',
    'hko.desc.clearIntervalsShowers': '部分時間有驟雨',
    'hko.desc.windy': '風勢頗大',
    'hko.desc.dry': '乾燥',
    'hko.desc.humid': '潮濕',
    'hko.desc.fog': '有霧',
    'hko.desc.mist': '薄霧',
    'hko.desc.haze': '煙霞',
    'hko.desc.hot': '炎熱',
    'hko.desc.warm': '和暖',
    'hko.desc.cool': '稍涼',
    'hko.desc.cold': '寒冷',

    // Sunrise / sunset countdown
    'sun.now': '現在',
    'sun.inHoursMinutes': '{0}小時{1}分後',
    'sun.inHours': '{0}小時後',
    'sun.inMinutes': '{0}分後',
    // Sun-cycle progress strip (CurrentWeather)
    'sun.daylight': '白天',
    'sun.night': '夜晚',
    
    // City search
    'search.placeholder': '搜尋城市...',
    'search.searching': '搜尋中...',
    'search.noResults': '找不到城市',
    'search.city': '搜尋城市',
    'search.useLocation': '使用目前位置',
    'search.locationUpdated': '位置已更新至 {0}',
    'search.locationError': '無法取得位置，請檢查權限設定。',
    
    // Loading states
    'loading.fetchingData': '正在載入天氣數據...',
    'loading.findingLocation': '正在取得位置...',
    'loading.allowLocation': '請允許存取位置以獲取當地天氣',
    'loading.welcome': '歡迎使用天氣',
    'loading.searchPrompt': '搜尋城市以查看天氣和預報',
    'loading.failed': '載入天氣資料失敗',
    'loading.tryAgain': '請稍後再試',
    
    // Fallback banners
    'fallback.hkoTitle': 'Open-Meteo API 離線',
    'fallback.hkoDesc': 'Open-Meteo 天氣 API 目前連線出現問題。已自動為您切換至香港天文台的即時天氣數據。最新狀態請查看：https://status.open-meteo.com/',
    'fallback.cacheTitle': '天氣服務離線',
    'fallback.cacheDesc': '所有天氣服務 API 目前皆處於離線狀態。正在顯示上次成功載入的快照資料。',

    // Data
    'data.refresh': '刷新資料',
    'data.refreshing': '正在刷新天氣資料...',
    'data.refreshed': '天氣資料已刷新',
    'data.refreshFailed': '刷新資料失敗',
    'data.usingCached': '正在顯示快取資料',
    'data.partialData': '目前僅顯示 {0} 的部分資料',
    'data.partialDataNoSource': '目前僅顯示部分資料',
    'data.partialDataDesc': '部分資料來源未能連線，預報及天氣警告可能不完整。',
    'data.offline': '目前離線',
    'data.offlineWithTs': '目前離線：正在顯示 {0} 的快取資料',
    'data.offlineDesc': '無法連線至天氣服務，顯示的內容可能未能反映最新狀況。',
    'data.refetchLive': '重新擷取即時資料',

    // Weather source
    'source.openMeteo': 'Open-Meteo',
    'source.openMeteoDesc': '全球天氣資料',
    'source.hko': '香港天文台',
    'source.hkoDesc': '僅限香港',
    'source.poweredBy': '資料來源：{0}',
    'source.poweredByBoth': '資料來源：{0} 及 {1}',
    
    // Language
    'language.en': 'English',
    'language.tc': '繁體中文',

    // Units (metric ↔ US)
    'settings.units': '單位',
    'settings.metric': '公制',
    'settings.us': '美制',
    'unit.mph': '英里/小時',
    'unit.in': '英寸',

    // Text size (root font-size scale)
    'settings.fontSize': '字體大小',
    'settings.fontSize.small': '細',
    'settings.fontSize.medium': '標準',
    'settings.fontSize.large': '大',

    // Current weather
    'weather.feelsLike': '體感溫度',
    'weather.wind': '風',
    'weather.windSpeed': '風速',
    'weather.windDirection': '風向',
    'weather.humidity': '濕度',
    'weather.uvIndex': '紫外線指數',
    // UV 強度級別（WHO UV 指數分級）。
    'uv.low': '低',
    'uv.moderate': '中',
    'uv.high': '高',
    'uv.veryHigh': '甚高',
    'uv.extreme': '極高',
    'uv.unavailable': '無法取得',
    // 空氣質素健康指數（環境保護署，僅香港地區）。
    'weather.aqhi': '空氣質素健康指數',
    'aqhi.low': '低',
    'aqhi.moderate': '中',
    'aqhi.high': '高',
    'aqhi.veryHigh': '很高',
    'unit.kmh': '公里/小時',
    // Quiet shelf — aria-label on the icon row holding distilled metrics.
    'quiet.shelfLabel': '無需關注的指標',
    
    // Nowcast Map
    'nowcast.title': '雨雲即時預報',
    'nowcast.subtitle': '未來一小時會下雨嗎？我該留下還是離開？',
    'nowcast.load': '載入地圖 (~2.7MB)',
    'nowcast.downloading': '正在下載雨量預報數據...',
    'nowcast.error': '無法載入雨量預報數據。',
    'nowcast.view': '查看降雨地圖',
    'nowcast.desc': '載入即時雨雲預報地圖，以查看未來兩小時是否有降雨接近。',
    'nowcast.legend': '降雨量 (毫米)',
    'nowcast.updated': '更新時間: {0}',
    'nowcast.mapLabel': '網格雨量預報地圖',
    'nowcast.play': '播放時間線',
    'nowcast.pause': '暫停時間線',
    'nowcast.slider': '雨量時間線',
    'nowcast.stayOrGo': '留或走',
    'nowcast.forecastStep': '預報時段',
    'nowcast.switchBasemap': '切換地圖底圖（目前：{0}）',
    'nowcast.refreshNowcast': '刷新雨量預報',
    'nowcast.loadFailed': '載入資料失敗',
    'nowcast.tryAgain': '重試',
    'nowcast.basemapLight': '淺色',
    'nowcast.basemapDark': '深色',
    'nowcast.staleTitle': '正在使用上次預報',
    'nowcast.staleDesc': '刷新失敗，正在顯示先前的雨量預報 — 網絡穩定後請重試。',
    'nowcast.loadingSlow': '網絡較慢 — 正在下載雨量預報',

    // MSC（溫哥華）預報 — GeoMet WMS。步驟控制／載入／錯誤狀態沿用 nowcast.*，以下為 MSC 專用鍵（D-006）。
    'msc.legendTitle': '降水強度',
    'msc.intensityLow': '低',
    'msc.intensityModerate': '中等',
    'msc.intensityHigh': '高',
    'msc.noPrecipitation': '預報中沒有降水',
    'msc.usingLastAnalysis': '正在使用最近一次分析（{0}）',

    // Wind direction (aria-label on the rotating arrow SVG)
    'weather.windDirAria': '風向：{0}° {1}',

    // Settings menu
    'settings.label': '設定',

    // Hourly / daily chart kickers
    'hourly.nextNHours': '未來 {0} 小時',
    'daily.lookAhead': '七日概覽',

    // 404 page
    'notFound.code': '404',
    'notFound.title': '抱歉，找不到此頁面',
    'notFound.returnHome': '返回首頁',

    // PWA install button (visible label)
    'pwa.install': '安裝',

    // Share forecast（ShareForecastButton / share-forecast.ts）— 把未來數日
    // 天氣組成訊息，方便傳給朋友。
    'share.forecast': '分享天氣預報',
    'share.title': '天氣概況',
    'share.header': '{0}未來幾日天氣：',
    'share.rainChance': '降雨 {0}%',
    'share.copied': '已複製天氣預報，貼給朋友吧',
    'share.copyFailed': '無法複製天氣預報',

    // Rain-start banner（HKO 即時預報 0–2 小時 + 其後 Open-Meteo；見
    // RainStartBanner / rain-start.ts）。Open-Meteo 網格約 8 公里，只屬
    // 全港尺度，故加上「全港預報」標示。
    'rainstart.now': '正在下雨',
    'rainstart.nowUntil': '正在下雨 · 預計 {0} 前後減弱',
    'rainstart.expectedIn': '預計 {0} 前後有雨 · {1}',
    // expectedIn 的讀屏版本：省去每分鐘變動的倒數，保持 live region 內容穩定。
    'rainstart.expectedAt': '預計 {0} 前後有雨',
    'rainstart.none': '未來 {0} 小時預計無雨',
    'rainstart.citywide': '全港預報',
    'rainstart.inMinutes': '約 {0} 分鐘後',
    'rainstart.inHours': '約 {0} 小時後',
    'rainstart.inHoursMin': '約 {0} 小時 {1} 分後',

    // At-a-glance 降雨標籤 — 跳至降雨即時預報面板（見 AtAGlance）。
    'glance.rainAria': '降雨機率 {0}%。查看降雨即時預報地圖。',
    'glance.rainTitle': '查看降雨即時預報',
  },
};

export const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    let initial: Language = 'en';
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEYS.LANGUAGE) as Language | null;
      // Validate against the set of supported languages so a tampered
      // localStorage value (e.g. 'fr') doesn't leak into <html lang> or the
      // translations[] lookup. Mirrors the pattern in UnitsContext.tsx.
      if (raw && VALID_LANGUAGES.has(raw)) initial = raw;
    }
    // WCAG 3.1.1 — set <html lang> synchronously before the first paint so
    // screen readers never see a flash of 'en' on a Chinese-filled page.
    // Mutating document.documentElement is a non-React side effect and is
    // idempotent; the useEffect below handles subsequent changes.
    if (typeof document !== 'undefined') {
      document.documentElement.lang = HTML_LANG[initial];
    }
    return initial;
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEYS.LANGUAGE, lang);
  }, []);

  // Keep <html lang> in sync with later language changes (covers the
  // setLanguage call above). The first paint is handled by the useState
  // initializer above.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = HTML_LANG[language];
  }, [language]);

  const t = useCallback((key: string, fallback?: string): string => {
    return translations[language][key] || fallback || key;
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

// Helper function to format strings with placeholders
export function formatString(template: string, ...args: (string | number)[]): string {
  return template.replace(/{(\d+)}/g, (match, index) => {
    return typeof args[index] !== 'undefined' ? String(args[index]) : match;
  });
}
