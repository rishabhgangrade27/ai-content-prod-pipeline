import { run } from "./exec.js";

/**
 * Derives a 16:9 frame from a 9:16 source image without a second image-gen
 * call: a blurred, cropped copy of the same image fills the full-width
 * background, with the original centered on top at full height. Cheaper
 * than generating a second image per scene, and looks intentional rather
 * than plain letterboxing.
 */
export async function padToLandscape(
  sourceImagePath: string,
  outPath: string,
  width = 1920,
  height = 1080,
): Promise<void> {
  const filter =
    `[0:v]scale=${width}:-1,crop=${width}:${height},gblur=sigma=25[bg];` +
    `[0:v]scale=-1:${height}[fg];` +
    `[bg][fg]overlay=(W-w)/2:(H-h)/2`;

  await run("ffmpeg", ["-y", "-i", sourceImagePath, "-filter_complex", filter, "-frames:v", "1", outPath]);
}
