import { writeFile } from "node:fs/promises";
import path from "node:path";
import { run } from "./exec.js";

/** Concatenates same-codec clips via the concat demuxer (stream copy — fast,
 * lossless). Every scene clip is encoded with identical libx264/aac settings
 * in scene-clip.ts specifically so this stream copy is valid.
 *
 * Note: the concat demuxer's list-file quoting is NOT the same as ffmpeg
 * filter-graph escaping (`escapeFilterPath` in exec.ts) — it doesn't want
 * `:` backslash-escaped, just a valid path inside single quotes. */
export async function concatClips(clipPaths: string[], listFilePath: string, outPath: string): Promise<void> {
  const listContents = clipPaths
    .map((clipPath) => `file '${path.resolve(clipPath).replace(/\\/g, "/")}'`)
    .join("\n");
  await writeFile(listFilePath, listContents);

  await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFilePath, "-c", "copy", outPath]);
}
