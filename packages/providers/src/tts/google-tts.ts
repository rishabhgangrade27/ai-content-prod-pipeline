import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import type { TTSInput, TTSOutput, TTSProvider } from "./types.js";

const PROVIDER_NAME = "google-cloud-tts";

export class GoogleCloudTTSProvider implements TTSProvider {
  private client: TextToSpeechClient;

  constructor() {
    // Uses Application Default Credentials — either GOOGLE_APPLICATION_CREDENTIALS
    // pointing at a service account key file, or `gcloud auth application-default login`.
    this.client = new TextToSpeechClient();
  }

  async synthesize(input: TTSInput): Promise<TTSOutput> {
    const [response] = await this.client.synthesizeSpeech({
      input: { text: input.text },
      voice: {
        languageCode: input.languageCode ?? "en-US",
        ssmlGender: "NEUTRAL",
      },
      audioConfig: { audioEncoding: "MP3" },
    });

    if (!response.audioContent) {
      throw new Error("Google Cloud TTS returned no audio content");
    }

    return {
      audio: Buffer.from(response.audioContent),
      contentType: "audio/mpeg",
      provider: PROVIDER_NAME,
    };
  }
}
