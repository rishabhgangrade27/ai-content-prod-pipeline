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

export interface MediaStreamInfo {
  width?: number;
  height?: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

/** Confirms a file/URL is a decodable media file and reports its stream shape.
 * Throws (rather than returning a "no" answer) if ffprobe can't read it at
 * all — a corrupt or empty file is exactly the kind of QA failure this
 * exists to catch. */
export async function probeStreams(input: string): Promise<MediaStreamInfo> {
  const out = await runCapture("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type,width,height",
    "-of",
    "json",
    input,
  ]);

  const parsed = JSON.parse(out) as { streams?: Array<{ codec_type?: string; width?: number; height?: number }> };
  const streams = parsed.streams ?? [];
  const videoStream = streams.find((s) => s.codec_type === "video");
  const hasAudio = streams.some((s) => s.codec_type === "audio");

  return {
    width: videoStream?.width,
    height: videoStream?.height,
    hasVideo: Boolean(videoStream),
    hasAudio,
  };
}
