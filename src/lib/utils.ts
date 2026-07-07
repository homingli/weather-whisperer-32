import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Deterministic cache key for (locale, options). Sorts the options object's
 * own keys before stringifying so `{ year: 'numeric', month: 'long' }` and
 * `{ month: 'long', year: 'numeric' }` collide on the same cache slot
 * (same semantics, same formatter).
 */
function formatterCacheKey(locale: string, options: Intl.DateTimeFormatOptions): string {
  const sortedKeys = Object.keys(options).sort();
  const sortedOptions: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    sortedOptions[k] = (options as Record<string, unknown>)[k];
  }
  return `${locale}|${JSON.stringify(sortedOptions)}`;
}

/**
 * Module-level cache for Intl.DateTimeFormat instances.
 * Constructing an Intl.DateTimeFormat is expensive (parses locale, walks ICU data).
 * Across the app, the same (locale, options) pair is needed many times per render.
 * Cache by `locale|sorted-options` so the formatter is built at most once.
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
  const key = formatterCacheKey(locale, options);
  const cached = dateTimeFormatterCache.get(key);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, options);
  // Re-check before publishing in case another caller raced to the same key
  // between the get() and the construction. Theoretical in single-threaded JS
  // (no awaits in this path) but the guard is free.
  const existing = dateTimeFormatterCache.get(key);
  if (existing) return existing;
  dateTimeFormatterCache.set(key, formatter);
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
