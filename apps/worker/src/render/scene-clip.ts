import { run, escapeFilterPath } from "./exec.js";

export interface SceneClipInput {
  /** Must be a local file path — `-loop 1` re-reads the same input every
   * frame, which an HTTP source can't do reliably. Download it first. */
  imagePath: string;
  /** A remote URL is fine here — audio is read once, sequentially. */
  audioUrl: string;
  captionFilePath: string;
  width: number;
  height: number;
  durationSeconds: number;
  outPath: string;
}

const FPS = 25;

// Falls back to a near-universal Windows font for local dev; override for
// Linux deployment (e.g. /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf).
const FONT_FILE = process.env.CAPTION_FONT_FILE ?? "C:/Windows/Fonts/arial.ttf";

/**
 * One scene = its still image animated with a Ken Burns zoom, its narration
 * audio track, and a burned-in caption drawn from the scene's own script text.
 * zoompan needs a source larger than the output to zoom into, hence the 2x
 * pre-scale before scaling back down to the target resolution.
 */
export async function renderSceneClip(input: SceneClipInput): Promise<void> {
  const { imagePath, audioUrl, captionFilePath, width, height, durationSeconds, outPath } = input;
  const totalFrames = Math.round(durationSeconds * FPS);

  const filter = [
    `scale=${width * 2}:${height * 2}`,
    `zoompan=z='min(zoom+0.0015,1.5)':d=${totalFrames}:s=${width}x${height}:fps=${FPS}`,
    `drawtext=fontfile='${escapeFilterPath(FONT_FILE)}':textfile='${escapeFilterPath(captionFilePath)}':reload=0:` +
      `fontcolor=white:fontsize=${Math.round(width / 22)}:line_spacing=6:` +
      `box=1:boxcolor=black@0.55:boxborderw=14:x=(w-text_w)/2:y=h-th-${Math.round(height * 0.08)}`,
  ].join(",");

  await run("ffmpeg", [
    "-y",
    "-loop",
    "1",
    "-i",
    imagePath,
    "-i",
    audioUrl,
    "-vf",
    filter,
    "-t",
    durationSeconds.toFixed(2),
    "-r",
    String(FPS),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    outPath,
  ]);
}
