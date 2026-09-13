export interface ImageGenerationInput {
  prompt: string;
  width: number;
  height: number;
}

export interface ImageGenerationOutput {
  url: string;
  provider: string;
  /** True if the provider's own safety classifier flagged the result — fed
   * into Stage 5's QA gate rather than silently trusted. */
  flagged: boolean;
}

export interface ImageProvider {
  generateImage(input: ImageGenerationInput): Promise<ImageGenerationOutput>;
}
