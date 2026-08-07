import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL || "postgres://placeholder";

// prepare: false is REQUIRED against Neon's pooled connection string (which is
// what Vercel's native Neon integration gives you by default — pgbouncer in
// transaction mode). Named prepared statements don't survive transaction
// pooling; without this flag, inserts/selects fail silently or throw
// "prepared statement already exists" errors that never reach the client.
// This was the root cause of tracks not appearing after upload.
const client = postgres(connectionString, { max: 1, prepare: false });
export const db = drizzle(client, { schema });
