import { describe, expect, it } from 'vitest';
import { cartoRasterUrl } from './carto';

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
