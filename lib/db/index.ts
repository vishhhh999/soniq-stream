import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

// IMPORTANT: this file is imported at build time (Next.js collects route
// metadata even for force-dynamic routes), so it must NOT throw here just
// because DATABASE_URL is missing during the build step — only when a query
// actually runs at request time. postgres() itself connects lazily, so a
// placeholder string is safe; a real missing-env failure will surface as a
// connection error on first real request, which is the correct place for it.
const connectionString = process.env.DATABASE_URL || "postgres://placeholder";

const client = postgres(connectionString, { max: 1 });
export const db = drizzle(client, { schema });
