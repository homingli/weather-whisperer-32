export const cache = {
  set: (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  },
  get: <T>(key: string, ttlMs: number): T | null => {
    const item = localStorage.getItem(key);
    if (!item) return null;
    try {
      const { data, timestamp } = JSON.parse(item);
      if (Date.now() - timestamp > ttlMs) {
        return null;
      }
      return data as T;
    } catch {
      return null;
    }
  },
  getRaw: <T>(key: string): { data: T; timestamp: number } | null => {
    const item = localStorage.getItem(key);
    if (!item) return null;
    try {
      return JSON.parse(item);
    } catch {
      return null;
    }
  },
  clearWeather: () => {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('weather_combined_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  },
};

