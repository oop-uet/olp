import { db } from "/Users/tuyenkv/Documents/OOP/backend/src/db/index.ts";
import { submissions } from "/Users/tuyenkv/Documents/OOP/backend/src/db/schema.ts";
import { eq, like } from "drizzle-orm";

async function main() {
  try {
    console.log("Searching for submissions with failed styleStatus...");
    const results = await db
      .select()
      .from(submissions)
      .where(eq(submissions.styleStatus, "failed"))
      .limit(10);

    console.log(`Found ${results.length} failed style submission(s):`);
    for (const sub of results) {
      console.log("-----------------------------------------");
      console.log("ID:", sub.id);
      console.log("Style Status:", sub.styleStatus);
      console.log("Style Score:", sub.styleScore);
      console.log("Style Report:", sub.styleReport);
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
