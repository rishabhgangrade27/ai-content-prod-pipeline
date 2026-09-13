import type { QAVerdict } from "./review-gate.js";
import { probeStreams, getDurationSeconds } from "../render/ffprobe.js";

const MIN_SCRIPT_WORDS = 60;
const MAX_SCRIPT_WORDS = 260;

/** Deterministic, no-API-call checks — catches empty/truncated/refused
 * generations before they ever reach scene planning. */
export function validateScript(script: string): QAVerdict {
  const wordCount = script.trim().split(/\s+/).filter(Boolean).length;

  if (wordCount < MIN_SCRIPT_WORDS) {
    return { pass: false, feedback: `Script was only ${wordCount} words; needs to be a full ~150-word ad script.` };
  }
  if (wordCount > MAX_SCRIPT_WORDS) {
    return { pass: false, feedback: `Script was ${wordCount} words, too long for a 15-30s spot; tighten it to ~150 words.` };
  }
  if (/^(i cannot|i can't|i'm sorry|as an ai)/i.test(script.trim())) {
    return { pass: false, feedback: "Response looked like a refusal/apology rather than an ad script." };
  }
  return { pass: true };
}

export async function validateImage(
  url: string,
  flagged: boolean,
  expectedOrientation: "portrait" | "landscape" | "square",
): Promise<QAVerdict> {
  if (flagged) {
    return {
      pass: false,
      feedback: "Image was flagged by the provider's safety classifier; regenerate with a clearly safe-for-work prompt.",
    };
  }

  const info = await probeStreams(url);
  if (!info.hasVideo || !info.width || !info.height) {
    return { pass: false, feedback: "Generated file is not a valid, decodable image." };
  }

  const actual = info.width === info.height ? "square" : info.width < info.height ? "portrait" : "landscape";
  if (expectedOrientation !== "square" && actual !== expectedOrientation) {
    return {
      pass: false,
      feedback: `Expected a ${expectedOrientation} image but got ${actual} (${info.width}x${info.height}).`,
    };
  }
  return { pass: true };
}

export async function validateAudio(url: string): Promise<QAVerdict> {
  try {
    const duration = await getDurationSeconds(url);
    if (duration < 0.3) {
      return { pass: false, feedback: `Audio is only ${duration.toFixed(2)}s — likely empty or truncated.` };
    }
    return { pass: true };
  } catch (err) {
    return { pass: false, feedback: `Audio file is not decodable: ${(err as Error).message}` };
  }
}

export async function validateVideo(
  localPath: string,
  expectedWidth: number,
  expectedHeight: number,
  minDurationSeconds: number,
): Promise<QAVerdict> {
  const info = await probeStreams(localPath);
  if (!info.hasVideo) {
    return { pass: false, feedback: "Rendered file has no video stream." };
  }
  if (!info.hasAudio) {
    return { pass: false, feedback: "Rendered file has no audio stream." };
  }
  if (info.width !== expectedWidth || info.height !== expectedHeight) {
    return {
      pass: false,
      feedback: `Rendered at ${info.width}x${info.height}, expected ${expectedWidth}x${expectedHeight}.`,
    };
  }

  const duration = await getDurationSeconds(localPath);
  if (duration < minDurationSeconds - 1) {
    return {
      pass: false,
      feedback: `Rendered duration ${duration.toFixed(1)}s is shorter than the expected ~${minDurationSeconds.toFixed(1)}s.`,
    };
  }
  return { pass: true };
}
