import { writeFile } from "node:fs/promises";

/** Downloads a remote asset to a local file — needed wherever ffmpeg must
 * seek/re-read an input (e.g. `-loop 1` on a still image), which HTTP inputs
 * don't support reliably. */
export async function downloadToFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destPath, buffer);
}
