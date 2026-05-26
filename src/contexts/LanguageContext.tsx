import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';

export type Language = 'en' | 'tc';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Header
    'hko.name': 'Hong Kong Observatory',
    
    // Weather alerts
    'alerts.title': 'Weather Alerts',
    'alerts.issued': 'Issued',
    
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
    
    // Daily forecast
    'daily.title': '7-DAY FORECAST',
    'daily.today': 'Today',
    'daily.tomorrow': 'Tomorrow',
    'daily.low': 'Low',
    'daily.high': 'High',
    'daily.precip': 'Precipitation',
    'daily.sunrise': 'Sunrise',
    'daily.sunset': 'Sunset',
    
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
    'fallback.hkoFailedTitle': 'HKO Data Unavailable',
    'fallback.hkoFailedDesc': 'Hong Kong Observatory data could not be loaded. Warnings and local forecast may be missing.',
    
    // Data
    'data.refresh': 'Refresh Data',
    'data.refreshing': 'Refreshing weather data...',
    'data.refreshed': 'Weather data refreshed',
    'data.refreshFailed': 'Failed to refresh data',
    
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
    
    // Current weather
    'weather.feelsLike': 'Feels like',
    'weather.wind': 'Wind',
    'weather.windSpeed': 'Wind Speed',
    'weather.windDirection': 'Wind Direction',
    'weather.humidity': 'Humidity',
    'weather.uvIndex': 'UV Index',
    'unit.kmh': 'km/h',
    
    // Nowcast Map
    'nowcast.title': 'Rain Cloud Nowcast',
    'nowcast.subtitle': 'Is the rain coming in the next hour? Shall I stay or shall I leave?',
    'nowcast.load': 'Load Map (~2.7MB)',
    'nowcast.error': 'Could not load gridded rainfall data.',
    'nowcast.view': 'View Rainfall Map',
    'nowcast.desc': 'Load the real-time gridded rainfall nowcast to see if rain is approaching in the next 2 hours.',
    'nowcast.legend': 'Rainfall (mm)',
    'nowcast.updated': 'Updated: {0}',
  },
  tc: {
    // Header
    'hko.name': '香港天文台',
    
    // Weather alerts
    'alerts.title': '天氣警告',
    'alerts.issued': '發出時間',
    
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
    
    // Daily forecast
    'daily.title': '7日天氣預報',
    'daily.today': '今日',
    'daily.tomorrow': '明日',
    'daily.low': '最低',
    'daily.high': '最高',
    'daily.precip': '降水',
    'daily.sunrise': '日出',
    'daily.sunset': '日落',
    
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
    'fallback.hkoFailedTitle': '天文台數據未能載入',
    'fallback.hkoFailedDesc': '未能載入香港天文台數據，天氣警告及本地預報可能缺失。',
    
    // Data
    'data.refresh': '刷新資料',
    'data.refreshing': '正在刷新天氣資料...',
    'data.refreshed': '天氣資料已刷新',
    'data.refreshFailed': '刷新資料失敗',
    
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
    
    // Current weather
    'weather.feelsLike': '體感溫度',
    'weather.wind': '風',
    'weather.windSpeed': '風速',
    'weather.windDirection': '風向',
    'weather.humidity': '濕度',
    'weather.uvIndex': '紫外線指數',
    'unit.kmh': '公里/小時',
    
    // Nowcast Map
    'nowcast.title': '雨雲即時預報',
    'nowcast.subtitle': '未來一小時會下雨嗎？我該留下還是離開？',
    'nowcast.load': '載入地圖 (~2.7MB)',
    'nowcast.error': '無法載入雨量預報數據。',
    'nowcast.view': '查看降雨地圖',
    'nowcast.desc': '載入即時雨雲預報地圖，以查看未來兩小時是否有降雨接近。',
    'nowcast.legend': '降雨量 (毫米)',
    'nowcast.updated': '更新時間: {0}',
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('weather-language') as Language) || 'en';
    }
    return 'en';
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('weather-language', lang);
  }, []);

  const t = useCallback((key: string): string => {
    return translations[language][key] || key;
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
