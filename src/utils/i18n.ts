// UI string lookup for the plugin. English is the canonical map; additional
// locales (ja, ko) are added as Partial maps that fall back to English.
// See docs/design/i18n.md for the design and migration order.
import { en, I18nKey } from '../locales/en';
import { ja } from '../locales/ja';
import { ko } from '../locales/ko';

export type { I18nKey };

const LOCALE_STRINGS: Record<string, Partial<Record<I18nKey, string>>> = {
  en,
  ja,
  ko,
};

// Same normalization approach as mapLocaleToDeepLTargetLanguage:
// trim, lowercase, fall back to the base language tag (e.g. 'ja-JP' → 'ja').
function normalizeLocale(locale: string): string {
  return locale.trim().toLowerCase();
}

export function t(key: I18nKey, locale?: string): string {
  const normalized = normalizeLocale(resolveLocale(locale));
  const base = normalized.split('-')[0];
  return LOCALE_STRINGS[normalized]?.[key] ?? LOCALE_STRINGS[base]?.[key] ?? en[key];
}

export function detectLocale(): string {
  const appLanguage = (window as unknown as { getLanguage?: () => string }).getLanguage?.();
  if (typeof appLanguage === 'string' && appLanguage.trim()) {
    return appLanguage;
  }

  const momentLocale = (window as Window & { moment?: { locale?: () => string } }).moment?.locale?.();
  if (typeof momentLocale === 'string' && momentLocale.trim()) {
    return momentLocale;
  }

  const navigatorLocale = navigator?.language;
  if (typeof navigatorLocale === 'string' && navigatorLocale.trim()) {
    return navigatorLocale;
  }

  return '';
}

// The uiLanguage setting override lives here: 'auto' (or anything falsy)
// resolves to the detected locale; any other value is used as-is.
export function resolveLocale(preferred: string | undefined): string {
  return preferred && preferred !== 'auto' ? preferred : detectLocale();
}
