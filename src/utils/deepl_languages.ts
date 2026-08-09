import { detectLocale } from '@utils/i18n';

export const AUTO_TRANSLATION_LANGUAGE = 'auto';

export const DEEPL_TARGET_LANGUAGES: Record<string, string> = {
  [AUTO_TRANSLATION_LANGUAGE]: 'Auto (follow Obsidian language)',
  AR: 'Arabic',
  BG: 'Bulgarian',
  CS: 'Czech',
  DA: 'Danish',
  DE: 'German',
  EL: 'Greek',
  'EN-GB': 'English (British)',
  'EN-US': 'English (American)',
  ES: 'Spanish',
  ET: 'Estonian',
  FI: 'Finnish',
  FR: 'French',
  HU: 'Hungarian',
  ID: 'Indonesian',
  IT: 'Italian',
  JA: 'Japanese',
  KO: 'Korean',
  LT: 'Lithuanian',
  LV: 'Latvian',
  NB: 'Norwegian Bokmal',
  NL: 'Dutch',
  PL: 'Polish',
  'PT-BR': 'Portuguese (Brazilian)',
  'PT-PT': 'Portuguese (European)',
  RO: 'Romanian',
  RU: 'Russian',
  SK: 'Slovak',
  SL: 'Slovenian',
  SV: 'Swedish',
  TR: 'Turkish',
  UK: 'Ukrainian',
  'ZH-HANS': 'Chinese (Simplified)',
  'ZH-HANT': 'Chinese (Traditional)',
};

const LOCALE_TO_DEEPL_TARGET_LANGUAGE: Record<string, string> = {
  ar: 'AR',
  bg: 'BG',
  cs: 'CS',
  da: 'DA',
  de: 'DE',
  'de-at': 'DE',
  'de-ch': 'DE',
  el: 'EL',
  en: 'EN-US',
  'en-gb': 'EN-GB',
  'en-us': 'EN-US',
  es: 'ES',
  'es-us': 'ES',
  et: 'ET',
  fi: 'FI',
  fr: 'FR',
  'fr-ca': 'FR',
  'fr-ch': 'FR',
  hu: 'HU',
  id: 'ID',
  it: 'IT',
  ja: 'JA',
  ko: 'KO',
  lt: 'LT',
  lv: 'LV',
  nb: 'NB',
  nn: 'NB',
  no: 'NB',
  nl: 'NL',
  pl: 'PL',
  pt: 'PT-PT',
  'pt-br': 'PT-BR',
  ro: 'RO',
  ru: 'RU',
  sk: 'SK',
  sl: 'SL',
  sv: 'SV',
  tr: 'TR',
  uk: 'UK',
  zh: 'ZH-HANS',
  'zh-cn': 'ZH-HANS',
  'zh-hans': 'ZH-HANS',
  'zh-sg': 'ZH-HANS',
  'zh-hk': 'ZH-HANT',
  'zh-mo': 'ZH-HANT',
  'zh-tw': 'ZH-HANT',
  'zh-hant': 'ZH-HANT',
};

export function resolveTranslationTargetLanguage(preferredLanguage: string): string | null {
  if (preferredLanguage && preferredLanguage !== AUTO_TRANSLATION_LANGUAGE) {
    return DEEPL_TARGET_LANGUAGES[preferredLanguage] ? preferredLanguage : null;
  }

  return mapLocaleToDeepLTargetLanguage(detectLocale());
}

export function isEnglishTargetLanguage(targetLanguage: string | null): boolean {
  return targetLanguage === 'EN-GB' || targetLanguage === 'EN-US';
}

export function mapLocaleToDeepLTargetLanguage(locale: string): string | null {
  const normalizedLocale = locale.trim().toLowerCase();
  if (!normalizedLocale) {
    return null;
  }

  return (
    LOCALE_TO_DEEPL_TARGET_LANGUAGE[normalizedLocale] ??
    LOCALE_TO_DEEPL_TARGET_LANGUAGE[normalizedLocale.split('-')[0]] ??
    null
  );
}
