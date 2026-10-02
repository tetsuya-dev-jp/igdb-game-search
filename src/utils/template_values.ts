import { GameEntry } from '@models/game.model';

const ARRAY_FIELDS = [
  'alternativeTitles',
  'platforms',
  'genres',
  'themes',
  'gameModes',
  'playerPerspectives',
  'developers',
  'publishers',
  'similarGames',
  'screenshots',
  'websites',
  'localScreenshots',
] as const;

/** JSON is also a YAML flow value. Escape script delimiters for Templater. */
export function templateJson(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function templateValues(game: GameEntry): Record<string, unknown> {
  const values: Record<string, unknown> = {
    timeToBeatMain: '',
    timeToBeatAverage: '',
    timeToBeatCompletionist: '',
    steamAppId: '',
    steamStoreUrl: '',
    steamPlaytimeHours: '',
    steamAchievements: [],
    steamAchievementsUnlocked: '',
    steamAchievementsTotal: '',
    ...game,
  };
  for (const key of ARRAY_FIELDS) values[`${key}List`] = templateJson(game[key] ?? []);
  values.localCoverWikilink = game.localCoverImage ? `[[${game.localCoverImage}]]` : '';
  values.firstScreenshotWikilink = game.localScreenshots?.[0] ? `[[${game.localScreenshots[0]}]]` : '';
  const times = {
    main: values.timeToBeatMain ?? '',
    average: values.timeToBeatAverage ?? '',
    completionist: values.timeToBeatCompletionist ?? '',
  };
  values.timeToBeat = times;
  values.timeToBeatList = templateJson(Object.values(times));
  return values;
}

export function templateString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value) && value.every(item => item == null || typeof item !== 'object'))
    return value.map(templateString).join(',');
  return templateJson(value);
}

/** Single-pass substitution: metadata cannot recursively become a template. */
export function renderGameVariables(game: GameEntry, text: string): string {
  const values = new Map(Object.entries(templateValues(game)).map(([key, value]) => [key.toLowerCase(), value]));
  return text.replace(/{{\s*(\w+)\s*((?:\|[^{}\r\n]+)*)}}/g, (token, key: string, filters: string) => {
    if (!values.has(key.toLowerCase())) return token;
    let value = values.get(key.toLowerCase());
    let serialized = false;
    for (const filter of filters.split('|').slice(1)) {
      const colon = filter.indexOf(':');
      const name = (colon < 0 ? filter : filter.slice(0, colon)).trim().toLowerCase();
      const arg = colon < 0 ? undefined : filter.slice(colon + 1);
      if (name === 'first') value = Array.isArray(value) ? value[0] ?? '' : value;
      else if (name === 'join')
        value = Array.isArray(value) ? value.map(templateString).join(arg ?? ', ') : templateString(value);
      else if (name === 'json' || name === 'yaml') serialized = true;
      else return token; // Never execute arbitrary expressions.
    }
    if (serialized) return templateJson(value ?? '');
    if (key.toLowerCase() === 'steamachievements' || key.toLowerCase() === 'timetobeat') {
      return templateJson(value);
    }
    return templateString(value);
  });
}
