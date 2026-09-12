import type { MusicSearchInput, MusicSearchOutput, MusicProvider } from "./types.js";

const PROVIDER_NAME = "freesound";
const BASE_URL = "https://freesound.org/apiv2/search/text/";

interface FreesoundResult {
  id: number;
  name: string;
  username: string;
  license: string;
  previews: {
    "preview-hq-mp3": string;
    "preview-lq-mp3": string;
  };
}

interface FreesoundSearchResponse {
  count: number;
  results: FreesoundResult[];
}

export class FreesoundMusicProvider implements MusicProvider {
  constructor(private apiKey = process.env.FREESOUND_API_KEY) {}

  async findTrack(input: MusicSearchInput): Promise<MusicSearchOutput | null> {
    if (!this.apiKey) {
      throw new Error("FREESOUND_API_KEY is not set");
    }

    // Commercial-safe by default: CC0 or Attribution only, never NonCommercial.
    const filterParts = ['(license:"Creative Commons 0" OR license:"Attribution")'];
    if (input.maxDurationSeconds) {
      filterParts.push(`duration:[0 TO ${input.maxDurationSeconds}]`);
    }

    const params = new URLSearchParams({
      query: input.query,
      token: this.apiKey,
      fields: "id,name,username,license,previews",
      filter: filterParts.join(" "),
      page_size: "1",
    });

    const response = await fetch(`${BASE_URL}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Freesound search failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as FreesoundSearchResponse;
    const track = data.results[0];
    if (!track) {
      return null;
    }

    return {
      previewUrl: track.previews["preview-hq-mp3"],
      license: track.license,
      attribution: `"${track.name}" by ${track.username} (freesound.org, ${track.license})`,
      provider: PROVIDER_NAME,
    };
  }
}
