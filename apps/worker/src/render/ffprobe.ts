import { runCapture } from "./exec.js";

/** Duration in seconds of a local file or remote URL (ffprobe reads both). */
export async function getDurationSeconds(input: string): Promise<number> {
  const out = await runCapture("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    input,
  ]);
  const seconds = Number.parseFloat(out.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`ffprobe returned an invalid duration for ${input}: "${out}"`);
  }
  return seconds;
}
