export interface ImageGenerationInput {
  prompt: string;
  width: number;
  height: number;
}

export interface ImageGenerationOutput {
  url: string;
  provider: string;
}

export interface ImageProvider {
  generateImage(input: ImageGenerationInput): Promise<ImageGenerationOutput>;
}
