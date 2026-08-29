const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY?.trim();

if (!CARTO_API_KEY) {
  console.warn('[carto] VITE_CARTO_API_KEY not found; using unauthenticated raster basemap URL');
}

/** Build Carto raster URL, adding API key when configured. */
export function cartoRasterUrl(
  style: 'light_all' | 'dark_all' | 'voyager',
  apiKey = CARTO_API_KEY,
): string {
  const key = apiKey?.trim() ? `?key=${encodeURIComponent(apiKey.trim())}` : '';
  return `https://{s}.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}{r}.png${key}`;
}
