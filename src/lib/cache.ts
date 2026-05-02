export const cache = {
  set: (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  },
  get: <T>(key: string, ttlMs: number): T | null => {
    const item = localStorage.getItem(key);
    if (!item) return null;
    const { data, timestamp } = JSON.parse(item);
    if (Date.now() - timestamp > ttlMs) {
      localStorage.removeItem(key);
      return null;
    }
    return data as T;
  },
};
