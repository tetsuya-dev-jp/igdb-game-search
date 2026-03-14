export interface FrontMatter {
  [key: string]: string | string[];
}

export interface GameEntry {
  title: string;
  alternativeTitle?: string;
  alternativeTitles?: string[];
  slug?: string;
  summary?: string;
  storyline?: string;
  igdbUrl?: string;
  website?: string;
  websites?: string[];
  platform?: string;
  platforms?: string[];
  genre?: string;
  genres?: string[];
  theme?: string;
  themes?: string[];
  gameMode?: string;
  gameModes?: string[];
  playerPerspective?: string;
  playerPerspectives?: string[];
  developer?: string;
  developers?: string[];
  publisher?: string;
  publishers?: string[];
  franchise?: string;
  collection?: string;
  firstReleaseDate?: string;
  releaseYear?: string;
  rating?: number | string;
  ratingCount?: number | string;
  aggregatedRating?: number | string;
  aggregatedRatingCount?: number | string;
  totalRating?: number | string;
  totalRatingCount?: number | string;
  coverUrl?: string;
  coverSmallUrl?: string;
  coverLargeUrl?: string;
  screenshot?: string;
  screenshots?: string[];
  localScreenshot?: string;
  localScreenshots?: string[];
  localCoverImage?: string;
}
