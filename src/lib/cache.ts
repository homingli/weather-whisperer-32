export const cache = {
  set: (key: string, data: any, ttlMs?: number) => {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now(), ttl: ttlMs }));
  },
  get: <T>(key: string, ttlMs: number): T | null => {
    const item = localStorage.getItem(key);
    if (!item) return null;
    try {
      const { data, timestamp, ttl } = JSON.parse(item);
      const activeTtl = ttl !== undefined ? ttl : ttlMs;
      if (Date.now() - timestamp > activeTtl) {
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

