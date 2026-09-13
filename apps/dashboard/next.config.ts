import type { NextConfig } from "next";
import path from "node:path";
import dotenv from "dotenv";

// Single root .env is shared across the whole monorepo for local dev — same
// pattern as every other app/package here (see e.g. apps/api/src/env.ts).
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
