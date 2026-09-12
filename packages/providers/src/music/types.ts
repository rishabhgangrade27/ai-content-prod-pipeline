export interface MusicSearchInput {
  query: string;
  maxDurationSeconds?: number;
}

export interface MusicSearchOutput {
  previewUrl: string;
  license: string;
  attribution: string;
  provider: string;
}

export interface MusicProvider {
  findTrack(input: MusicSearchInput): Promise<MusicSearchOutput | null>;
}
