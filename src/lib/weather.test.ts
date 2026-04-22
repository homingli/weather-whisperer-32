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
            { city: 'London DST', tz: 'Europe/London', dateStr: '2024-07-08T12:00', expectedHourUTC: 11 }, // GMT+1 (Summer/BST)
            { city: 'Paris', tz: 'Europe/Paris', dateStr: '2024-01-08T12:00', expectedHourUTC: 11 }, // GMT+1 (Winter)
            { city: 'Israel', tz: 'Asia/Jerusalem', dateStr: '2024-01-08T12:00', expectedHourUTC: 10 }, // GMT+2 (Winter)
            { city: 'Auckland', tz: 'Pacific/Auckland', dateStr: '2024-01-08T12:00', expectedHourUTC: 23, expectedDayUTC: 7 }, // GMT+13 (Summer)
        ];

        testCases.forEach(({ city, tz, dateStr, expectedHourUTC, expectedDayUTC }) => {
            it(`should correctly parse time for ${city} (${tz})`, () => {
                const date = parseDateInTimezone(dateStr, tz);
                expect(date.getUTCHours()).toBe(expectedHourUTC);
                if (expectedDayUTC !== undefined) {
                    expect(date.getUTCDate()).toBe(expectedDayUTC);
                }
            });
        });

        it('should correctly parse daily date for Vancouver (GMT-8)', () => {
            const date = parseDailyDateInTimezone('2024-01-08', 'America/Vancouver');
            // Vancouver 00:00 is 08:00 UTC
            expect(date.getUTCHours()).toBe(8);
            expect(date.getUTCDate()).toBe(8);
        });

        it('should correctly parse daily date for Hong Kong (GMT+8)', () => {
            const date = parseDailyDateInTimezone('2024-01-08', 'Asia/Hong_Kong');
            // HK 00:00 is 16:00 UTC of PREVIOUS day
            expect(date.getUTCHours()).toBe(16);
            expect(date.getUTCDate()).toBe(7);
        });

        it('should handle DST transition boundary (London Spring Forward)', () => {
            // March 31, 2024: 01:00 becomes 02:00
            const before = parseDateInTimezone('2024-03-31T00:59', 'Europe/London');
            const after = parseDateInTimezone('2024-03-31T02:01', 'Europe/London');
            
            expect(before.getUTCHours()).toBe(0); // UTC+0
            expect(after.getUTCHours()).toBe(1);  // UTC+1
        });
    });
});
