import { describe, expect, it } from 'vitest';
import { cartoMapLibreRasterUrl, cartoRasterUrl, cartoStyleUrl } from './carto';

describe('cartoRasterUrl', () => {
  it('adds URL-encoded API key when provided', () => {
    expect(cartoRasterUrl('voyager', ' test/key ')).toBe(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=test%2Fkey',
    );
  });

  it('omits query string without API key', () => {
    expect(cartoRasterUrl('voyager', '   ')).toBe(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    );
  });
});

describe('MapLibre Carto URLs', () => {
  it('uses vector style URL and explicit raster host', () => {
    expect(cartoStyleUrl('positron', ' test/key ')).toContain('/gl/positron-gl-style/style.json?key=test%2Fkey');
    expect(cartoMapLibreRasterUrl('light_all', 'test')).toBe(
      'https://a.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=test',
    );
  });
});
