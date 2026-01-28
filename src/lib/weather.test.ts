import { describe, it, expect } from 'vitest';
import {
    getWeatherDescription,
    getWeatherIcon,
    parseDateInTimezone,
    parseDailyDateInTimezone
} from './weather';

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

    describe('Timezone Parsing', () => {
        const testCases = [
            { city: 'Hong Kong', tz: 'Asia/Hong_Kong', dateStr: '2024-01-08T12:00', expectedHourUTC: 4 }, // GMT+8
            { city: 'Vancouver', tz: 'America/Vancouver', dateStr: '2024-01-08T12:00', expectedHourUTC: 20 }, // GMT-8 (Winter)
            { city: 'London', tz: 'Europe/London', dateStr: '2024-01-08T12:00', expectedHourUTC: 12 }, // GMT+0 (Winter)
            { city: 'Paris', tz: 'Europe/Paris', dateStr: '2024-01-08T12:00', expectedHourUTC: 11 }, // GMT+1 (Winter)
            { city: 'Israel', tz: 'Asia/Jerusalem', dateStr: '2024-01-08T12:00', expectedHourUTC: 10 }, // GMT+2 (Winter)
        ];

        testCases.forEach(({ city, tz, dateStr, expectedHourUTC }) => {
            it(`should correctly parse time for ${city} (${tz})`, () => {
                const date = parseDateInTimezone(dateStr, tz);
                expect(date.getUTCHours()).toBe(expectedHourUTC);
            });
        });

        it('should correctly parse daily date for Vancouver', () => {
            const date = parseDailyDateInTimezone('2024-01-08', 'America/Vancouver');
            expect(date.getUTCHours()).toBe(8);
            expect(date.getUTCDate()).toBe(8);
        });

        it('should correctly parse daily date for Hong Kong', () => {
            const date = parseDailyDateInTimezone('2024-01-08', 'Asia/Hong_Kong');
            expect(date.getUTCHours()).toBe(16);
            expect(date.getUTCDate()).toBe(7);
        });
    });
});
