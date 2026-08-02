import { db } from "../src/db/index.ts";
import { submissions } from "../src/db/schema.ts";
import { sql } from "drizzle-orm";

async function main() {
  try {
    const results = await db
      .select({
        styleStatus: submissions.styleStatus,
        count: sql`count(*)`,
      })
      .from(submissions)
      .groupBy(submissions.styleStatus);

    console.log("Submission Style Status Counts:");
    console.table(results);
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
