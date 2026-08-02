import { db } from "../src/db/index.ts";
import { submissions } from "../src/db/schema.ts";
import { evaluateCheckstyle } from "../src/services/checkstyle.service.ts";
import { desc } from "drizzle-orm";

async function main() {
  try {
    const results = await db
      .select()
      .from(submissions)
      .orderBy(desc(submissions.submittedAt))
      .limit(10);

    console.log(`Found ${results.length} recent submissions:`);
    for (const sub of results) {
      console.log("=========================================");
      console.log("ID:", sub.id);
      console.log("Submitted At:", sub.submittedAt);
      console.log("Style Status:", sub.styleStatus);
      console.log("Style Score:", sub.styleScore);
      console.log("Code Preview:", sub.code.substring(0, 100) + "...");
      console.log("Style Report Summary:", sub.styleReport ? sub.styleReport.substring(0, 200) + "..." : "null");
      
      console.log("Evaluating locally...");
      const evalResult = await evaluateCheckstyle(sub.code);
      console.log("Local Style Status:", evalResult.status);
      console.log("Local Style Score:", evalResult.score);
      console.log("Local Violation Count:", evalResult.violationCount);
      if (evalResult.violations.length > 0) {
        console.log("Local Violations (first 3):", evalResult.violations.slice(0, 3));
      }
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
