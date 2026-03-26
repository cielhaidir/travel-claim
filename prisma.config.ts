import { readFileSync } from "node:fs";

function readDatabaseUrl(): string {
  const envContent = readFileSync(".env", "utf8");
  const line = envContent
    .split(/\r?\n/)
    .find((entry) => entry.startsWith("DATABASE_URL="));

  if (!line) {
    throw new Error("DATABASE_URL is missing in .env");
  }

  return line.slice("DATABASE_URL=".length).replace(/^"|"$/g, "");
}

export default {
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: readDatabaseUrl(),
  },
};
