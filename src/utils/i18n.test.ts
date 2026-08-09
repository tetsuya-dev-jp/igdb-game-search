import { detectLocale, resolveLocale, t } from './i18n';
import { describe, expect, it } from '@jest/globals';

// Locale detection depends on the jsdom environment (moment locale vs
// navigator.language), so lookup tests pass the locale explicitly.
describe('i18n', () => {
  it('returns the English string for an en locale', () => {
    expect(t('search.button', 'en')).toBe('Search');
    expect(t('search.heading', 'en-US')).toBe('Search game');
  });

  it('returns the Japanese string for a ja locale', () => {
    expect(t('search.button', 'ja')).toBe('検索');
    expect(t('search.heading', 'ja-JP')).toBe('ゲームを検索');
  });

  it('returns the Korean string for a ko locale', () => {
    expect(t('search.button', 'ko')).toBe('검색');
    expect(t('search.heading', 'ko-KR')).toBe('게임 검색');
  });

  it('falls back to English for a locale without a map', () => {
    expect(t('search.button', 'xx')).toBe('Search');
    expect(t('search.buttonRequesting', 'zz-ZZ')).toBe('Requesting...');
  });

  it('resolves the uiLanguage override', () => {
    const detected = detectLocale();
    expect(resolveLocale('auto')).toBe(detected);
    expect(resolveLocale('ja')).toBe('ja');
    expect(resolveLocale(undefined)).toBe(detected);
    expect(resolveLocale('')).toBe(detected);
  });

  it('detects a locale string in the test environment', () => {
    expect(typeof detectLocale()).toBe('string');
  });
});
