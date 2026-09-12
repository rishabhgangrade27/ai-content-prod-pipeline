export interface TTSInput {
  text: string;
  languageCode?: string;
}

export interface TTSOutput {
  audio: Buffer;
  contentType: string;
  provider: string;
}

export interface TTSProvider {
  synthesize(input: TTSInput): Promise<TTSOutput>;
}
