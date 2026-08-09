// UI string lookup for the plugin. English is the canonical map; additional
// locales (ja, ko) are added as Partial maps that fall back to English.
// See docs/design/i18n.md for the design and migration order.
const UI_STRINGS = {
  'search.button': 'Search',
  'search.buttonRequesting': 'Requesting...',
  'search.heading': 'Search game',
} as const;

export type I18nKey = keyof typeof UI_STRINGS;

const LOCALE_STRINGS: Record<string, Partial<Record<I18nKey, string>>> = {
  en: UI_STRINGS,
};

// Same normalization approach as mapLocaleToDeepLTargetLanguage:
// trim, lowercase, fall back to the base language tag (e.g. 'ja-JP' → 'ja').
function normalizeLocale(locale: string): string {
  return locale.trim().toLowerCase();
}

export function t(key: I18nKey, locale = detectLocale()): string {
  const normalized = normalizeLocale(locale);
  const base = normalized.split('-')[0];
  return LOCALE_STRINGS[normalized]?.[key] ?? LOCALE_STRINGS[base]?.[key] ?? UI_STRINGS[key];
}

export function detectLocale(): string {
  const momentLocale = (
    globalThis.window as (Window & { moment?: { locale?: () => string } }) | undefined
  )?.moment?.locale?.();
  if (typeof momentLocale === 'string' && momentLocale.trim()) {
    return momentLocale;
  }

  const navigatorLocale = globalThis.navigator?.language;
  if (typeof navigatorLocale === 'string' && navigatorLocale.trim()) {
    return navigatorLocale;
  }

  return '';
}
