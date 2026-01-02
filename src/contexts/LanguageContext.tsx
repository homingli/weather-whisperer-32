import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
    
    // Hourly forecast
    'hourly.title': 'HOURLY FORECAST',
    'hourly.now': 'Now',
    'hourly.temperature': 'Temperature',
    'hourly.rainChance': 'Rain Chance',
    
    // Daily forecast
    'daily.title': '7-DAY FORECAST',
    'daily.today': 'Today',
    'daily.tomorrow': 'Tomorrow',
    
    // City search
    'search.placeholder': 'Search for a city...',
    'search.searching': 'Searching...',
    'search.noResults': 'No cities found',
    'search.city': 'Search city',
    'search.useLocation': 'Use current location',
    'search.locationUpdated': 'Location updated to {0}',
    'search.locationError': 'Could not get your location. Please check permissions.',
    
    // Loading states
    'loading.findingLocation': 'Finding your location...',
    'loading.allowLocation': 'Please allow location access for local weather',
    'loading.welcome': 'Welcome to Weather',
    'loading.searchPrompt': 'Search for a city to see current weather and forecasts',
    'loading.failed': 'Failed to load weather data',
    'loading.tryAgain': 'Please try again later',
    
    // Weather source
    'source.openMeteo': 'Open-Meteo',
    'source.openMeteoDesc': 'Global weather data',
    'source.hko': 'HK Observatory',
    'source.hkoDesc': 'Hong Kong only',
    'source.poweredByBoth': 'Powered by {0} & {1}',
    'source.poweredBy': 'Powered by {0}',
    
    // Language
    'language.en': 'English',
    'language.tc': '繁體中文',
    
    // Current weather
    'weather.feelsLike': 'Feels like',
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
    
    // Hourly forecast
    'hourly.title': '每小時預報',
    'hourly.now': '現在',
    'hourly.temperature': '溫度',
    'hourly.rainChance': '降雨機率',
    
    // Daily forecast
    'daily.title': '7日天氣預報',
    'daily.today': '今日',
    'daily.tomorrow': '明日',
    
    // City search
    'search.placeholder': '搜尋城市...',
    'search.searching': '搜尋中...',
    'search.noResults': '找不到城市',
    'search.city': '搜尋城市',
    'search.useLocation': '使用目前位置',
    'search.locationUpdated': '位置已更新至 {0}',
    'search.locationError': '無法取得位置，請檢查權限設定。',
    
    // Loading states
    'loading.findingLocation': '正在取得位置...',
    'loading.allowLocation': '請允許存取位置以獲取當地天氣',
    'loading.welcome': '歡迎使用天氣',
    'loading.searchPrompt': '搜尋城市以查看天氣和預報',
    'loading.failed': '載入天氣資料失敗',
    'loading.tryAgain': '請稍後再試',
    
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

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('weather-language', lang);
  };

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
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
