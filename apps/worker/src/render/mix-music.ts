import { run } from "./exec.js";

/**
 * Overlays a background music track under the video's existing narration
 * audio: music is quieted and looped to cover the full video, then mixed
 * down and trimmed to the video's own (narration) duration.
 */
export async function mixMusic(videoPath: string, musicUrl: string, outPath: string): Promise<void> {
  await run("ffmpeg", [
    "-y",
    "-i",
    videoPath,
    "-i",
    musicUrl,
    "-filter_complex",
    "[1:a]volume=0.25,aloop=loop=-1:size=2e9[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=0[aout]",
    "-map",
    "0:v",
    "-map",
    "[aout]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-shortest",
    outPath,
  ]);
}
