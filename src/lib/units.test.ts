import { describe, it, expect } from 'vitest';
import {
  celsiusToFahrenheit,
  kmhToMph,
  mmToInches,
  toDisplayTemperature,
  toDisplayWindSpeed,
  toDisplayPrecipitation,
  temperatureUnitLabel,
  windSpeedUnitLabel,
  precipitationUnitLabel,
  formatTemperature,
  formatWindSpeed,
  formatPrecipitation,
} from './units';

describe('celsiusToFahrenheit', () => {
  it('converts 0°C to 32°F (water freezing)', () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
  });

  it('converts 100°C to 212°F (water boiling)', () => {
    expect(celsiusToFahrenheit(100)).toBe(212);
  });

  it('converts -40°C to -40°F (the crossover point)', () => {
    expect(celsiusToFahrenheit(-40)).toBe(-40);
  });

  it('converts 25°C to 77°F', () => {
    expect(celsiusToFahrenheit(25)).toBe(77);
  });
});

describe('kmhToMph', () => {
  it('converts 0 km/h to 0 mph', () => {
    expect(kmhToMph(0)).toBe(0);
  });

  it('converts 1 km/h to ~0.621 mph', () => {
    expect(kmhToMph(1)).toBeCloseTo(0.621371, 5);
  });

  it('converts 100 km/h to ~62.14 mph', () => {
    expect(kmhToMph(100)).toBeCloseTo(62.1371, 3);
  });
});

describe('mmToInches', () => {
  it('converts 0 mm to 0 in', () => {
    expect(mmToInches(0)).toBe(0);
  });

  it('converts 25.4 mm to exactly 1 in (the canonical conversion)', () => {
    expect(mmToInches(25.4)).toBeCloseTo(1.0, 4);
  });

  it('converts a trace of 0.5 mm to ~0.02 in', () => {
    expect(mmToInches(0.5)).toBeCloseTo(0.0197, 3);
  });
});

describe('formatTemperature', () => {
  it('formats metric as integer °C', () => {
    expect(formatTemperature(25.4, 'metric')).toBe('25°C');
  });

  it('formats US as integer °F (25.4°C rounds to 78°F)', () => {
    // 25.4 * 9/5 + 32 = 45.72 + 32 = 77.72 → rounds to 78
    expect(formatTemperature(25.4, 'us')).toBe('78°F');
  });

  it('formats 0°C as 32°F in US', () => {
    expect(formatTemperature(0, 'us')).toBe('32°F');
  });

  it('formats 0°C as 0°C in metric', () => {
    expect(formatTemperature(0, 'metric')).toBe('0°C');
  });
});

describe('formatWindSpeed', () => {
  it('formats metric as integer km/h value (no unit suffix; consumer adds label)', () => {
    expect(formatWindSpeed(15.7, 'metric')).toBe('16');
  });

  it('formats US as integer mph value', () => {
    // 15.7 * 0.621371 ≈ 9.7555 → 10
    expect(formatWindSpeed(15.7, 'us')).toBe('10');
  });

  it('formats 0 km/h as 0 mph in US', () => {
    expect(formatWindSpeed(0, 'us')).toBe('0');
  });
});

describe('formatPrecipitation', () => {
  it('formats metric with 1 decimal mm', () => {
    expect(formatPrecipitation(2.35, 'metric')).toBe('2.4');
  });

  it('formats US with 2 decimal in', () => {
    // 2.35 mm * 0.0393701 ≈ 0.0925 → "0.09"
    expect(formatPrecipitation(2.35, 'us')).toBe('0.09');
  });

  it('formats 0 mm as 0.00 in in US (preserves decimal precision)', () => {
    expect(formatPrecipitation(0, 'us')).toBe('0.00');
  });

  it('formats a trace of 0.5 mm as 0.02 in in US', () => {
    // 0.5 * 0.0393701 ≈ 0.01969 → "0.02"
    expect(formatPrecipitation(0.5, 'us')).toBe('0.02');
  });
});

describe('toDisplayTemperature', () => {
  it('returns integer °C in metric mode (no conversion)', () => {
    expect(toDisplayTemperature(20.4, 'metric')).toBe(20);
  });

  it('returns integer °F in US mode (with conversion)', () => {
    // 20.4 °C * 9/5 + 32 = 68.72 → 69
    expect(toDisplayTemperature(20.4, 'us')).toBe(69);
  });
});

describe('toDisplayWindSpeed', () => {
  it('returns integer km/h in metric mode', () => {
    expect(toDisplayWindSpeed(15.7, 'metric')).toBe(16);
  });

  it('returns integer mph in US mode', () => {
    // 15.7 * 0.621371 ≈ 9.7555 → 10
    expect(toDisplayWindSpeed(15.7, 'us')).toBe(10);
  });
});

describe('toDisplayPrecipitation', () => {
  it('returns mm in metric mode (no conversion)', () => {
    expect(toDisplayPrecipitation(2.35, 'metric')).toBe(2.35);
  });

  it('returns inches in US mode', () => {
    expect(toDisplayPrecipitation(25.4, 'us')).toBeCloseTo(1.0, 4);
  });
});

describe('unit label helpers', () => {
  it('temperatureUnitLabel returns °C / °F', () => {
    expect(temperatureUnitLabel('metric')).toBe('°C');
    expect(temperatureUnitLabel('us')).toBe('°F');
  });

  it('windSpeedUnitLabel returns km/h / mph', () => {
    expect(windSpeedUnitLabel('metric')).toBe('km/h');
    expect(windSpeedUnitLabel('us')).toBe('mph');
  });

  it('precipitationUnitLabel returns mm / in', () => {
    expect(precipitationUnitLabel('metric')).toBe('mm');
    expect(precipitationUnitLabel('us')).toBe('in');
  });
});