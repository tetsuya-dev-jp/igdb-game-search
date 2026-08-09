export interface IgdbNamedEntity {
  name: string;
}

export interface IgdbImage {
  image_id: string;
}

export interface IgdbAlternativeName {
  name: string;
}

export interface IgdbCompany {
  name: string;
}

export interface IgdbInvolvedCompany {
  company?: IgdbCompany;
  developer?: boolean;
  publisher?: boolean;
}

export interface IgdbWebsite {
  url: string;
}

export interface IgdbGame {
  name: string;
  slug?: string;
  summary?: string;
  storyline?: string;
  url?: string;
  first_release_date?: number;
  alternative_names?: IgdbAlternativeName[];
  platforms?: IgdbNamedEntity[];
  genres?: IgdbNamedEntity[];
  themes?: IgdbNamedEntity[];
  game_modes?: IgdbNamedEntity[];
  player_perspectives?: IgdbNamedEntity[];
  franchises?: IgdbNamedEntity[];
  collections?: IgdbNamedEntity[];
  similar_games?: Array<{ id: number; name: string }>;
  involved_companies?: IgdbInvolvedCompany[];
  rating?: number;
  rating_count?: number;
  aggregated_rating?: number;
  aggregated_rating_count?: number;
  total_rating?: number;
  total_rating_count?: number;
  cover?: IgdbImage;
  screenshots?: IgdbImage[];
  websites?: IgdbWebsite[];
}

export interface TwitchAccessTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}
