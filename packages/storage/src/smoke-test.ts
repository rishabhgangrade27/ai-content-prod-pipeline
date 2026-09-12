/**
 * Manual smoke test: npx tsx src/smoke-test.ts
 * Uploads a small object to MinIO/S3 and fetches it back via its public URL.
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ObjectStorage } from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const storage = new ObjectStorage();
const result = await storage.uploadBuffer(
  "smoke-test/hello.txt",
  Buffer.from("hello from stage 3"),
  "text/plain",
);
console.log("uploaded:", result);

const res = await fetch(result.url);
console.log("fetch status:", res.status);
console.log("fetch body:", await res.text());
