const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY?.trim();
export const cartoApiKey = CARTO_API_KEY;

if (!CARTO_API_KEY) console.warn('[carto] VITE_CARTO_API_KEY not found');

export type CartoStyle = 'positron' | 'dark-matter';

export function cartoStyleUrl(style: CartoStyle, apiKey = CARTO_API_KEY): string {
  const name = style === 'positron' ? 'positron' : 'dark-matter';
  const key = apiKey?.trim() ? `?key=${encodeURIComponent(apiKey.trim())}` : '';
  return `https://basemaps.cartocdn.com/gl/${name}-gl-style/style.json${key}`;
}

export function cartoRasterUrl(
  style: 'light_all' | 'dark_all' | 'voyager',
  apiKey = CARTO_API_KEY,
): string {
  const key = apiKey?.trim() ? `?key=${encodeURIComponent(apiKey.trim())}` : '';
  return `https://{s}.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}{r}.png${key}`;
}

/** MapLibre raster template: explicit host, since `{s}` is not MapLibre syntax. */
export function cartoMapLibreRasterUrl(
  style: 'light_all' | 'dark_all' | 'voyager',
  apiKey = CARTO_API_KEY,
): string {
  const key = apiKey?.trim() ? `?key=${encodeURIComponent(apiKey.trim())}` : '';
  return `https://a.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}.png${key}`;
}
