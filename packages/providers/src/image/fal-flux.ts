import { fal } from "@fal-ai/client";
import type { ImageGenerationInput, ImageGenerationOutput, ImageProvider } from "./types.js";

const MODEL_ID = "fal-ai/flux/schnell";

export class FalFluxImageProvider implements ImageProvider {
  constructor(apiKey = process.env.FAL_KEY) {
    fal.config({ credentials: apiKey });
  }

  async generateImage(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
    const result = await fal.subscribe(MODEL_ID, {
      input: {
        prompt: input.prompt,
        image_size: aspectPreset(input.width, input.height),
        num_inference_steps: 4,
        num_images: 1,
      },
    });

    const image = result.data.images[0];
    if (!image) {
      throw new Error("fal.ai FLUX schnell returned no images");
    }
    return { url: image.url, provider: MODEL_ID };
  }
}

/** Maps our width/height intent onto fal's named FLUX presets. */
function aspectPreset(
  width: number,
  height: number,
): "portrait_16_9" | "landscape_16_9" | "square_hd" {
  if (width === height) return "square_hd";
  return width < height ? "portrait_16_9" : "landscape_16_9";
}
