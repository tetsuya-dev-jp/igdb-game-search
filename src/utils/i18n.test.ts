import { detectLocale, t } from './i18n';

// Locale detection depends on the jsdom environment (moment locale vs
// navigator.language), so lookup tests pass the locale explicitly.
describe('i18n', () => {
  it('returns the English string for an en locale', () => {
    expect(t('search.button', 'en')).toBe('Search');
    expect(t('search.heading', 'en-US')).toBe('Search game');
  });

  it('falls back to English for a locale without a map', () => {
    expect(t('search.button', 'ja')).toBe('Search');
    expect(t('search.buttonRequesting', 'ko-KR')).toBe('Requesting...');
  });

  it('detects a locale string in the test environment', () => {
    expect(typeof detectLocale()).toBe('string');
  });
});
