import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { LanguageProvider, useLanguage } from './LanguageContext';

describe('LanguageContext.t', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns the translation for an existing key', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper: LanguageProvider });
    expect(result.current.t('alerts.toast.view')).toBe('View');
  });

  it('returns the TC translation after switching language', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper: LanguageProvider });
    act(() => result.current.setLanguage('tc'));
    expect(result.current.t('alerts.toast.view')).toBe('查看');
  });

  it('returns the key itself when no key and no fallback', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper: LanguageProvider });
    expect(result.current.t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('returns the fallback when key is missing', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper: LanguageProvider });
    expect(result.current.t('nonexistent.key', 'fallback value')).toBe('fallback value');
  });

  it('prefers the translation over the fallback', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper: LanguageProvider });
    expect(result.current.t('alerts.toast.view', 'should not win')).toBe('View');
  });
});

describe('LanguageContext warning names', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('resolves TC8 to a localized name in en', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper: LanguageProvider });
    expect(result.current.t('warnings.TC8', 'fallback')).toBe('No. 8 Gale or Storm Signal');
  });

  it('resolves TC8 to a localized name in tc', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper: LanguageProvider });
    act(() => result.current.setLanguage('tc'));
    expect(result.current.t('warnings.TC8', 'fallback')).toBe('八號烈風或暴風信號');
  });

  it('resolves WRAINB in both languages', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper: LanguageProvider });
    expect(result.current.t('warnings.WRAINB', 'fallback')).toBe('Black Rainstorm Warning');
    act(() => result.current.setLanguage('tc'));
    expect(result.current.t('warnings.WRAINB', 'fallback')).toBe('黑色暴雨警告信號');
  });

  it('falls back to the provided fallback for unknown warning codes', () => {
    const { result } = renderHook(() => useLanguage(), { wrapper: LanguageProvider });
    expect(result.current.t('warnings.UNKNOWN_XYZ', 'API-provided name')).toBe('API-provided name');
  });
});
