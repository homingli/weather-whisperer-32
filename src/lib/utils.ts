import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Module-level cache for Intl.DateTimeFormat instances.
 * Constructing an Intl.DateTimeFormat is expensive (parses locale, walks ICU data).
 * Across the app, the same (locale, options) pair is needed many times per render.
 * Cache by `locale|serialized-options` so the formatter is built at most once.
 */
const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

/**
 * Return a memoized Intl.DateTimeFormat for the given locale + options.
 * Safe to call from render code; identical (locale, options) pairs reuse the same instance.
 */
export function getDateTimeFormatter(
  locale: string,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = dateTimeFormatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateTimeFormatterCache.set(key, formatter);
  }
  return formatter;
}

/**
 * Format a Date with the cached Intl.DateTimeFormat, falling back to `toLocaleString`
 * when the timezone is invalid (e.g. user-supplied city with bogus tz).
 */
export function formatInTimezone(
  date: Date,
  locale: string,
  options: Intl.DateTimeFormatOptions
): string {
  try {
    return getDateTimeFormatter(locale, options).format(date);
  } catch {
    return date.toLocaleString();
  }
}

/** Pick the right locale for our two supported UI languages. */
export function appLocale(language: 'en' | 'tc'): string {
  return language === 'tc' ? 'zh-HK' : 'en-US';
}
