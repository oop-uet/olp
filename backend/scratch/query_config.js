import { db } from "../src/db/index.ts";
import { systemConfig } from "../src/db/schema.ts";

async function main() {
  try {
    const results = await db.select().from(systemConfig);
    console.log("System Configuration:");
    console.table(results);
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
