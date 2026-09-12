import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Single root .env is shared across the whole monorepo for local dev.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
