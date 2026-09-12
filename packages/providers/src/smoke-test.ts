/**
 * Manual smoke test — not part of the automated test suite (that's Stage 12).
 * Run individual providers once you've added real API keys to the root .env:
 *
 *   npx tsx src/smoke-test.ts llm
 *   npx tsx src/smoke-test.ts image
 *   npx tsx src/smoke-test.ts tts
 *   npx tsx src/smoke-test.ts music
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createLLMProvider,
  createImageProvider,
  createTTSProvider,
  createMusicProvider,
} from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const BRIEF = "15s vertical UGC ad for a reusable stainless steel water bottle";

async function main() {
  const target = process.argv[2];

  if (target === "llm") {
    const llm = createLLMProvider();
    const script = await llm.generateScript(BRIEF);
    console.log("--- script ---\n", script);
    const scenes = await llm.generateSceneBreakdown(BRIEF, script);
    console.log("--- scenes ---\n", JSON.stringify(scenes, null, 2));
    return;
  }

  if (target === "image") {
    const image = createImageProvider();
    const result = await image.generateImage({
      prompt: "A stainless steel water bottle on a rustic wooden table, morning light",
      width: 1080,
      height: 1920,
    });
    console.log("--- image ---\n", result);
    return;
  }

  if (target === "tts") {
    const tts = createTTSProvider();
    const result = await tts.synthesize({ text: "Stay hydrated, stay unstoppable." });
    console.log(`--- tts --- ${result.audio.length} bytes, ${result.contentType}`);
    return;
  }

  if (target === "music") {
    const music = createMusicProvider();
    const result = await music.findTrack({ query: "upbeat corporate", maxDurationSeconds: 30 });
    console.log("--- music ---\n", result);
    return;
  }

  console.error("Usage: npx tsx src/smoke-test.ts <llm|image|tts|music>");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
