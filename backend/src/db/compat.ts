import { db as defaultDb } from "./index.js";

type Database = typeof defaultDb;

async function executeRaw(database: Database, statement: string) {
  const client = (database as any).session?.client;
  if (!client) return;

  if (typeof client.execute === "function") {
    await client.execute(statement);
    return;
  }

  if (typeof client.exec === "function") {
    client.exec(statement);
  }
}

async function addColumnIfMissing(database: Database, statement: string) {
  try {
    await executeRaw(database, statement);
  } catch (error: any) {
    const message = String(error?.message ?? error).toLowerCase();
    if (!message.includes("duplicate column") && !message.includes("no such table")) {
      throw error;
    }
  }
}

export async function ensureDatabaseCompatibility(database: Database = defaultDb) {
  await addColumnIfMissing(
    database,
    "ALTER TABLE test_cases ADD COLUMN time_limit_seconds INTEGER"
  );
}
