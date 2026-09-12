import { prisma } from "@pipeline/db";

export async function recordCostEvent(
  jobId: string,
  stage: string,
  provider: string,
  units: number,
  usdEstimate: number,
) {
  await prisma.costEvent.create({
    data: { jobId, stage, provider, units, usdEstimate },
  });
}

/**
 * Claude Haiku 4.5 pricing: $1/$5 per MTok (input/output). The LLM provider
 * interface (Stage 2) returns plain text, not token usage, so this is a rough
 * ~4-chars-per-token estimate for cost visibility, not an exact billed figure.
 */
export function estimateLLMCostUsd(inputChars: number, outputChars: number): number {
  const inputTokens = inputChars / 4;
  const outputTokens = outputChars / 4;
  return (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0;
}

/** fal.ai FLUX.1 [schnell]: $0.003 per megapixel, billed rounded up. */
export function imageCostUsd(width: number, height: number): number {
  const megapixels = Math.ceil((width * height) / 1_000_000);
  return megapixels * 0.003;
}

/**
 * Google Cloud TTS: first 4M standard-voice characters/month are free.
 * We don't track monthly cumulative usage here, so this estimates the
 * worst-case standard-voice rate ($4/1M chars) rather than assuming free.
 */
export function ttsCostUsd(characters: number): number {
  return (characters / 1_000_000) * 4.0;
}
