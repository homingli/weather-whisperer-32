import { describe, expect, it } from 'vitest';
import { cartoMapLibreRasterUrl, cartoStyleUrl } from './carto';

describe('MapLibre Carto URLs', () => {
  it('uses vector style URL and explicit raster host', () => {
    expect(cartoStyleUrl('positron', ' test/key ')).toContain('/gl/positron-gl-style/style.json?key=test%2Fkey');
    expect(cartoMapLibreRasterUrl('light_all', 'test')).toBe(
      'https://a.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=test',
    );
  });
});
