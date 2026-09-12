import { writeFile } from "node:fs/promises";
import path from "node:path";
import { getDurationSeconds } from "./ffprobe.js";
import { wrapCaption } from "./caption.js";
import { renderSceneClip } from "./scene-clip.js";
import { concatClips } from "./concat.js";
import { mixMusic } from "./mix-music.js";

export interface RenderScene {
  order: number;
  narration: string;
  /** Local file path — caller decides whether this is the original
   * downloaded image or a landscape-padded derivative. */
  imagePath: string;
  audioUrl: string;
}

export interface RenderVariantOptions {
  workDir: string;
  variantTag: string;
  width: number;
  height: number;
  scenes: RenderScene[];
  musicUrl?: string | null;
}

/** Renders one output variant (e.g. "vertical" or "landscape") end to end:
 * per-scene clips (image + Ken Burns + caption + narration) -> concat ->
 * optional music mix. Returns the final local file path. */
export async function renderVariant(opts: RenderVariantOptions): Promise<string> {
  const clipPaths: string[] = [];

  for (const scene of opts.scenes) {
    const duration = await getDurationSeconds(scene.audioUrl);
    const captionPath = path.join(opts.workDir, `caption-${opts.variantTag}-${scene.order}.txt`);
    await writeFile(captionPath, wrapCaption(scene.narration));

    const clipPath = path.join(opts.workDir, `scene-${opts.variantTag}-${scene.order}.mp4`);
    await renderSceneClip({
      imagePath: scene.imagePath,
      audioUrl: scene.audioUrl,
      captionFilePath: captionPath,
      width: opts.width,
      height: opts.height,
      durationSeconds: duration,
      outPath: clipPath,
    });
    clipPaths.push(clipPath);
  }

  const listFilePath = path.join(opts.workDir, `concat-list-${opts.variantTag}.txt`);
  const concatPath = path.join(opts.workDir, `concat-${opts.variantTag}.mp4`);
  await concatClips(clipPaths, listFilePath, concatPath);

  if (!opts.musicUrl) {
    return concatPath;
  }

  const finalPath = path.join(opts.workDir, `final-${opts.variantTag}.mp4`);
  await mixMusic(concatPath, opts.musicUrl, finalPath);
  return finalPath;
}
