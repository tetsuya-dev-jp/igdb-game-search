import { ApiError, ConfigurationError, GameMetadataApi, apiRequest } from '@apis/base_api';
import { GameEntry } from '@models/game.model';
import { GameSearchPluginSettings } from '@settings/settings';
import { IgdbGame, TwitchAccessTokenResponse } from './models/igdb_response';
import { resolveSteamAppId, steamStoreUrl } from './steam_api';

const IGDB_GAMES_URL = 'https://api.igdb.com/v4/games';
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const SEARCH_LIMIT = 20;
const TIME_TO_BEAT_URL = 'https://api.igdb.com/v4/game_time_to_beats';
const timeToBeatCache = new Map<
  number,
  { expires: number; data: { main: number | ''; average: number | ''; completionist: number | '' } }
>();

export class IgdbApi implements GameMetadataApi {
  constructor(
    private readonly settings: GameSearchPluginSettings,
    private readonly saveSettings: () => Promise<void>,
  ) {}

  async getTimeToBeat(
    gameId: number,
  ): Promise<{ main: number | ''; average: number | ''; completionist: number | '' }> {
    const empty = { main: '', average: '', completionist: '' } as const;
    if (!Number.isSafeInteger(gameId) || gameId <= 0) return empty;
    const cached = timeToBeatCache.get(gameId);
    if (cached && cached.expires > Date.now()) return cached.data;
    try {
      const data = await this.fetchTimeToBeat(gameId, false);
      const secondsToHours = (seconds?: number): number | '' =>
        typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
          ? Math.round((seconds / 3600) * 100) / 100
          : '';
      const row = data[0];
      const result = row
        ? {
            main: secondsToHours(row.hastily),
            average: secondsToHours(row.normally),
            completionist: secondsToHours(row.completely),
          }
        : empty;
      timeToBeatCache.set(gameId, { data: result, expires: Date.now() + 60 * 60 * 1000 });
      return result;
    } catch {
      // Transient/auth failures must not hide data after credentials are fixed.
      return empty;
    }
  }

  private async fetchTimeToBeat(
    gameId: number,
    retrying: boolean,
  ): Promise<Array<{ hastily?: number; normally?: number; completely?: number }>> {
    const token = await this.ensureAccessToken();
    try {
      return await apiRequest(TIME_TO_BEAT_URL, {
        method: 'POST',
        headers: { 'Client-ID': this.settings.twitchClientId, Authorization: `Bearer ${token}` },
        body: `fields game_id,hastily,normally,completely; where game_id = ${gameId}; limit 1;`,
      });
    } catch (error) {
      if (!retrying && error instanceof ApiError && error.status === 401) {
        await this.refreshAccessToken();
        return this.fetchTimeToBeat(gameId, true);
      }
      throw error;
    }
  }

  async getByQuery(query: string): Promise<GameEntry[]> {
    const searchQuery = query.trim();
    if (!searchQuery) {
      return [];
    }

    return this.executeSearch(searchQuery, false);
  }

  async ensureAccessToken(): Promise<string> {
    this.validateCredentials();

    const now = Date.now();
    if (
      this.settings.igdbAccessToken &&
      this.settings.igdbAccessTokenExpiresAt &&
      this.settings.igdbAccessTokenExpiresAt > now + 60_000
    ) {
      return this.settings.igdbAccessToken;
    }

    return this.refreshAccessToken();
  }

  async refreshAccessToken(): Promise<string> {
    this.validateCredentials();

    const response = await apiRequest<TwitchAccessTokenResponse>(TWITCH_TOKEN_URL, {
      method: 'POST',
      params: {
        client_id: this.settings.twitchClientId,
        client_secret: this.settings.twitchClientSecret,
        grant_type: 'client_credentials',
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    this.settings.igdbAccessToken = response.access_token;
    this.settings.igdbAccessTokenExpiresAt = Date.now() + response.expires_in * 1000;
    await this.saveSettings();
    return response.access_token;
  }

  buildSearchBody(query: string): string {
    const escapedQuery = query.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    return [
      'fields',
      [
        'name',
        'id',
        'slug',
        'summary',
        'storyline',
        'url',
        'first_release_date',
        'alternative_names.name',
        'platforms.name',
        'genres.name',
        'themes.name',
        'game_modes.name',
        'player_perspectives.name',
        'franchises.name',
        'collections.name',
        'similar_games.name',
        'involved_companies.company.name',
        'involved_companies.developer',
        'involved_companies.publisher',
        'rating',
        'rating_count',
        'aggregated_rating',
        'aggregated_rating_count',
        'total_rating',
        'total_rating_count',
        'cover.image_id',
        'screenshots.image_id',
        'websites.url',
        'external_games.uid',
        'external_games.url',
        'external_games.external_game_source.name',
      ].join(','),
      ';',
      `search "${escapedQuery}";`,
      'where version_parent = null;',
      `limit ${SEARCH_LIMIT};`,
    ].join(' ');
  }

  createGameEntry(game: IgdbGame): GameEntry {
    const platforms = this.toNames(game.platforms);
    const genres = this.toNames(game.genres);
    const themes = this.toNames(game.themes);
    const gameModes = this.toNames(game.game_modes);
    const playerPerspectives = this.toNames(game.player_perspectives);
    const similarGames = this.toNames(game.similar_games);
    const alternativeTitles = this.toNames(game.alternative_names);
    const developers = this.extractCompanyNames(game, 'developer');
    const publishers = this.extractCompanyNames(game, 'publisher');
    const screenshots = this.toImageUrls(game.screenshots, 't_screenshot_big_2x');
    const websites = this.toWebsiteUrls(game.websites);
    const firstReleaseDate = this.toReleaseDate(game.first_release_date);
    const steamAppId = resolveSteamAppId(websites, game.external_games);

    return {
      igdbId: game.id,
      ...(steamAppId ? { steamAppId, steamStoreUrl: steamStoreUrl(websites, steamAppId) } : {}),
      title: game.name,
      alternativeTitle: this.joinList(alternativeTitles),
      alternativeTitles,
      slug: game.slug ?? '',
      summary: game.summary ?? '',
      storyline: game.storyline ?? '',
      igdbUrl: game.url ?? '',
      website: this.joinList(websites),
      websites,
      platform: this.joinList(platforms),
      platforms,
      genre: this.joinList(genres),
      genres,
      theme: this.joinList(themes),
      themes,
      gameMode: this.joinList(gameModes),
      gameModes,
      playerPerspective: this.joinList(playerPerspectives),
      playerPerspectives,
      developer: this.joinList(developers),
      developers,
      publisher: this.joinList(publishers),
      publishers,
      franchise: game.franchises?.[0]?.name ?? '',
      collection: game.collections?.[0]?.name ?? '',
      similarGame: this.joinList(similarGames),
      similarGames,
      firstReleaseDate,
      releaseYear: firstReleaseDate ? firstReleaseDate.slice(0, 4) : '',
      rating: this.roundRating(game.rating),
      ratingCount: game.rating_count ?? '',
      aggregatedRating: this.roundRating(game.aggregated_rating),
      aggregatedRatingCount: game.aggregated_rating_count ?? '',
      totalRating: this.roundRating(game.total_rating),
      totalRatingCount: game.total_rating_count ?? '',
      coverUrl: this.toImageUrl(game.cover?.image_id, 't_cover_big'),
      coverSmallUrl: this.toImageUrl(game.cover?.image_id, 't_thumb'),
      coverLargeUrl: this.toImageUrl(game.cover?.image_id, 't_cover_big_2x'),
      screenshot: this.joinList(screenshots),
      screenshots,
    };
  }

  private async executeSearch(query: string, retrying: boolean): Promise<GameEntry[]> {
    const accessToken = await this.ensureAccessToken();

    try {
      const results = await apiRequest<IgdbGame[]>(IGDB_GAMES_URL, {
        method: 'POST',
        headers: {
          'Client-ID': this.settings.twitchClientId,
          Authorization: `Bearer ${accessToken}`,
        },
        body: this.buildSearchBody(query),
      });

      return results.map(result => this.createGameEntry(result));
    } catch (error) {
      if (!retrying && error instanceof ApiError && error.status === 401) {
        await this.refreshAccessToken();
        return this.executeSearch(query, true);
      }
      throw error;
    }
  }

  private validateCredentials() {
    if (!this.settings.twitchClientId || !this.settings.twitchClientSecret) {
      throw new ConfigurationError('Please set your Twitch Client ID and Client Secret in the plugin settings.');
    }
  }

  private toNames(values?: Array<{ name: string }>): string[] {
    return (values ?? []).map(value => value.name.trim()).filter(Boolean);
  }

  private joinList(values: string[]): string {
    return values.join(', ');
  }

  private extractCompanyNames(game: IgdbGame, type: 'developer' | 'publisher'): string[] {
    const names = (game.involved_companies ?? [])
      .filter(company => Boolean(company[type]))
      .map(company => company.company?.name?.trim() ?? '')
      .filter(Boolean);

    return [...new Set(names)];
  }

  private toImageUrl(imageId: string | undefined, size: string): string {
    if (!imageId) {
      return '';
    }

    return `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg`;
  }

  private toImageUrls(images: Array<{ image_id: string }> | undefined, size: string): string[] {
    return (images ?? []).map(image => this.toImageUrl(image.image_id, size)).filter(Boolean);
  }

  private toWebsiteUrls(websites?: Array<{ url: string }>): string[] {
    return (websites ?? []).map(website => website.url.trim()).filter(Boolean);
  }

  private toReleaseDate(unixSeconds?: number): string {
    if (!unixSeconds) {
      return '';
    }

    return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
  }

  private roundRating(value?: number): number | string {
    if (typeof value !== 'number') {
      return '';
    }

    return Math.round(value * 10) / 10;
  }
}
