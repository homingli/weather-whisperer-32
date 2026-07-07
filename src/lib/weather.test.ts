import { describe, it, expect } from 'vitest';
import { getWeatherDescription, getWeatherIcon } from './weather';

describe('Weather Utils', () => {
    describe('Basic Utils', () => {
        it('should return correct weather description', () => {
            expect(getWeatherDescription(0)).toBe('Clear sky');
            expect(getWeatherDescription(3)).toBe('Overcast');
            expect(getWeatherDescription(95)).toBe('Thunderstorm');
            expect(getWeatherDescription(999)).toBe('Unknown');
        });

        it('should return correct weather icon', () => {
            expect(getWeatherIcon(0, true)).toBe('☀️');
            expect(getWeatherIcon(0, false)).toBe('🌙');
            expect(getWeatherIcon(3, true)).toBe('☁️');
            expect(getWeatherIcon(95, true)).toBe('⛈️');
        });
    });
});
