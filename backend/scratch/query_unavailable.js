import { db } from "../src/db/index.ts";
import { submissions } from "../src/db/schema.ts";
import { eq } from "drizzle-orm";

async function main() {
  try {
    const results = await db
      .select()
      .from(submissions)
      .where(eq(submissions.styleStatus, "unavailable"));

    console.log("Unavailable Submissions:");
    for (const sub of results) {
      console.log("=========================================");
      console.log("ID:", sub.id);
      console.log("Feedback:", sub.styleFeedback);
      console.log("Code Preview:", sub.code.substring(0, 100) + "...");
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
