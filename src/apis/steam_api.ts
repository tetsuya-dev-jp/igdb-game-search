import { apiRequest } from '@apis/base_api';

const OWNED_GAMES_URL = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/';
const ACHIEVEMENTS_URL = 'https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/';
const VANITY_URL = 'https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/';
const CACHE_MS = 60 * 60 * 1000;
type GameData = {
  playtimeHours: number | '';
  achievements: SteamAchievement[];
  achieved: number | '';
  total: number | '';
};
interface OwnedGamesResponse {
  response?: { games?: Array<{ appid?: number; playtime_forever?: number }> };
}
interface AchievementsResponse {
  playerstats?: { success?: boolean; achievements?: unknown[] };
}
interface VanityResponse {
  response?: { success?: number; steamid?: string };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

export interface SteamAchievement {
  apiname: string;
  achieved: boolean;
  unlocktime: number;
}

export class SteamApi {
  private readonly cache = new Map<number, { expires: number; data: GameData }>();
  private profilePromise?: Promise<string | undefined>;
  private profileCache?: { expires: number; id: string | undefined };

  constructor(
    private readonly profile: string,
    private readonly apiKey: string,
  ) {}

  async getGameData(appId: number): Promise<GameData> {
    const empty = (): GameData => ({ playtimeHours: '', achievements: [], achieved: '', total: '' });
    if (!this.apiKey || !Number.isSafeInteger(appId) || appId <= 0) return empty();
    const cached = this.cache.get(appId);
    if (cached && cached.expires > Date.now()) return { ...cached.data, achievements: [...cached.data.achievements] };
    let steamId: string | undefined;
    try {
      steamId = await this.resolveProfile();
    } catch {
      return empty();
    }
    if (!steamId) return this.remember(appId, empty());
    const result = empty();
    let transientFailure = false;
    try {
      const owned = await apiRequest<OwnedGamesResponse>(OWNED_GAMES_URL, {
        params: {
          key: this.apiKey,
          steamid: steamId,
          include_appinfo: 0,
          include_played_free_games: 1,
          appids_filter: JSON.stringify([appId]),
        },
      });
      const games = owned?.response?.games;
      const game = Array.isArray(games) ? games.find(entry => entry.appid === appId) : undefined;
      if (
        game &&
        typeof game.playtime_forever === 'number' &&
        Number.isFinite(game.playtime_forever) &&
        game.playtime_forever >= 0
      )
        result.playtimeHours = Math.round((game.playtime_forever / 60) * 10) / 10;
    } catch {
      transientFailure = true;
    }
    try {
      const stats = await apiRequest<AchievementsResponse>(ACHIEVEMENTS_URL, {
        params: { key: this.apiKey, steamid: steamId, appid: appId },
      });
      const playerstats = stats?.playerstats;
      if (playerstats?.success === true) {
        const achievements: SteamAchievement[] = (
          Array.isArray(playerstats.achievements) ? playerstats.achievements : []
        ).flatMap(item => {
          if (
            !isRecord(item) ||
            typeof item.apiname !== 'string' ||
            (item.achieved !== 0 && item.achieved !== 1) ||
            typeof item.unlocktime !== 'number' ||
            !Number.isSafeInteger(item.unlocktime) ||
            item.unlocktime < 0
          )
            return [];
          return [{ apiname: item.apiname, achieved: item.achieved === 1, unlocktime: item.unlocktime }];
        });
        result.achievements = achievements;
        result.achieved = achievements.filter(a => a.achieved).length;
        result.total = achievements.length;
      }
    } catch {
      transientFailure = true;
    }
    return transientFailure ? result : this.remember(appId, result);
  }

  private remember(appId: number, data: GameData): GameData {
    this.cache.set(appId, { data, expires: Date.now() + CACHE_MS });
    return data;
  }

  private async resolveProfile(): Promise<string | undefined> {
    if (this.profileCache && this.profileCache.expires > Date.now()) return this.profileCache.id;
    this.profilePromise ??= this.resolveProfileId();
    try {
      const id = await this.profilePromise;
      this.profileCache = { id, expires: Date.now() + CACHE_MS };
      return id;
    } finally {
      this.profilePromise = undefined;
    }
  }

  private async resolveProfileId(): Promise<string | undefined> {
    const profile = this.profile.trim();
    if (/^\d{17}$/.test(profile)) return profile;
    let vanity: string | undefined;
    try {
      const url = new URL(profile);
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'steamcommunity.com' ||
        url.port ||
        url.username ||
        url.password
      )
        return;
      const match = url.pathname.match(/^\/(id|profiles)\/([^/]+)\/?$/);
      if (!match) return;
      if (match[1] === 'profiles') return /^\d{17}$/.test(match[2]) ? match[2] : undefined;
      vanity = match[2];
    } catch {
      return;
    }
    const data = await apiRequest<VanityResponse>(VANITY_URL, { params: { key: this.apiKey, vanityurl: vanity } });
    const id = data?.response?.steamid;
    return data?.response?.success === 1 && typeof id === 'string' && /^\d{17}$/.test(id) ? id : undefined;
  }
}

export function resolveSteamAppId(
  websites?: string[],
  externalGames?: Array<{ uid?: string; url?: string; external_game_source?: { name?: string }; category?: number }>,
): number | undefined {
  for (const urlText of websites ?? []) {
    try {
      const url = new URL(urlText);
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'store.steampowered.com' ||
        url.port ||
        url.username ||
        url.password
      )
        continue;
      const match = url.pathname.match(/^\/app\/([1-9]\d*)(?:\/[^/]*)?\/?$/);
      const id = match ? Number(match[1]) : NaN;
      if (Number.isSafeInteger(id)) return id;
    } catch {
      /* Ignore untrusted or malformed URLs. */
    }
  }
  for (const game of externalGames ?? []) {
    if (game.external_game_source?.name?.toLowerCase() !== 'steam' || !/^[1-9]\d*$/.test(game.uid ?? '')) continue;
    const id = Number(game.uid);
    if (Number.isSafeInteger(id)) return id;
  }
  return undefined;
}

export function steamStoreUrl(websites?: string[], appId?: number): string {
  const original = (websites ?? []).find(url => resolveSteamAppId([url]) !== undefined);
  if (original) return original;
  const resolved = resolveSteamAppId(websites);
  const id = resolved ?? (Number.isSafeInteger(appId) && (appId ?? 0) > 0 ? appId : undefined);
  return id ? `https://store.steampowered.com/app/${id}/` : '';
}
