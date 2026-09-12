export * from "./llm/types.js";
export * from "./image/types.js";
export * from "./tts/types.js";
export * from "./music/types.js";

export { ClaudeLLMProvider } from "./llm/claude.js";
export { FalFluxImageProvider } from "./image/fal-flux.js";
export { GoogleCloudTTSProvider } from "./tts/google-tts.js";
export { FreesoundMusicProvider } from "./music/freesound.js";

import { ClaudeLLMProvider } from "./llm/claude.js";
import { FalFluxImageProvider } from "./image/fal-flux.js";
import { GoogleCloudTTSProvider } from "./tts/google-tts.js";
import { FreesoundMusicProvider } from "./music/freesound.js";
import type { LLMProvider } from "./llm/types.js";
import type { ImageProvider } from "./image/types.js";
import type { TTSProvider } from "./tts/types.js";
import type { MusicProvider } from "./music/types.js";

/**
 * Env-driven provider registry. Swapping a provider (per the "evaluate new
 * models/tools and swap them in" requirement) means adding a case here and
 * setting one env var — call sites never change.
 */
export function createLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER ?? "claude";
  switch (provider) {
    case "claude":
      return new ClaudeLLMProvider();
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
  }
}

export function createImageProvider(): ImageProvider {
  const provider = process.env.IMAGE_PROVIDER ?? "fal-flux";
  switch (provider) {
    case "fal-flux":
      return new FalFluxImageProvider();
    default:
      throw new Error(`Unknown IMAGE_PROVIDER: ${provider}`);
  }
}

export function createTTSProvider(): TTSProvider {
  const provider = process.env.TTS_PROVIDER ?? "google-cloud-tts";
  switch (provider) {
    case "google-cloud-tts":
      return new GoogleCloudTTSProvider();
    default:
      throw new Error(`Unknown TTS_PROVIDER: ${provider}`);
  }
}

export function createMusicProvider(): MusicProvider {
  const provider = process.env.MUSIC_PROVIDER ?? "freesound";
  switch (provider) {
    case "freesound":
      return new FreesoundMusicProvider();
    default:
      throw new Error(`Unknown MUSIC_PROVIDER: ${provider}`);
  }
}
