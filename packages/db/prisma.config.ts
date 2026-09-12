import dotenv from "dotenv";
import { defineConfig, env } from "prisma/config";

// Single root .env is shared across the whole monorepo for local dev.
dotenv.config({ path: "../../.env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
