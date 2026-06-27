package vn.uet.oop.executor;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;

/**
 * Compares actual program output against expected output for each test case.
 * Orchestrates the full compile-and-run workflow and returns structured JSON results.
 */
public class TestCaseEvaluator {

    private static final Logger logger = LoggerFactory.getLogger(TestCaseEvaluator.class);

    private final CodeCompiler compiler;
    private final CodeRunner runner;

    public TestCaseEvaluator(String jdkPath) {
        this.compiler = new CodeCompiler(jdkPath);
        this.runner = new CodeRunner(jdkPath, new TimeoutManager());
    }

    /**
     * Evaluates student code against a set of test cases.
     * Compiles the code first, then runs each test case if compilation succeeds.
     *
     * @param code      the Java source code to evaluate
     * @param testCases JSON array of test cases, each with: id, input, expectedOutput, timeLimit
     * @return structured JSON result with compilation status and test results
     */
    public JsonObject evaluate(String code, JsonArray testCases) {
        JsonObject result = new JsonObject();
        result.addProperty("type", "result");

        // Step 1: Compile the code
        CodeCompiler.CompilationResult compilationResult = compiler.compile(code);

        if (!compilationResult.isSuccess()) {
            // Compilation failed - return errors
            result.addProperty("compiled", false);
            result.add("errors", compilationResult.getErrors());

            // Clean up temp directory
            CodeCompiler.cleanup(compilationResult.getWorkDir());

            logger.info("Compilation failed with {} error(s)", compilationResult.getErrors().size());
            return result;
        }

        // Step 2: Run each test case
        result.addProperty("compiled", true);
        JsonArray testResults = new JsonArray();

        Path workDir = compilationResult.getWorkDir();
        String className = extractClassName(code);

        for (int i = 0; i < testCases.size(); i++) {
            JsonObject testCase = testCases.get(i).getAsJsonObject();
            JsonObject testResult = runTestCase(workDir, className, testCase);
            testResults.add(testResult);
        }

        result.add("testResults", testResults);

        // Step 3: Clean up temp directory
        CodeCompiler.cleanup(workDir);

        logger.info("Evaluation complete: {} test case(s) executed", testCases.size());
        return result;
    }

    /**
     * Runs a single test case and returns the result.
     */
    private JsonObject runTestCase(Path workDir, String className, JsonObject testCase) {
        String id = testCase.has("id") ? testCase.get("id").getAsString() : "unknown";
        String input = testCase.has("input") ? testCase.get("input").getAsString() : "";
        String expectedOutput = testCase.has("expectedOutput") ? testCase.get("expectedOutput").getAsString() : "";
        int timeLimit = testCase.has("timeLimit") ? testCase.get("timeLimit").getAsInt() : 0;

        // Run the code with this test case's input
        CodeRunner.RunResult runResult = runner.run(workDir, className, input, timeLimit);

        JsonObject testResult = new JsonObject();
        testResult.addProperty("id", id);
        testResult.addProperty("executionTimeMs", runResult.getExecutionTimeMs());

        switch (runResult.getStatus()) {
            case "timeout":
                testResult.addProperty("status", "timeout");
                testResult.addProperty("actualOutput", "");
                break;

            case "runtime_error":
                testResult.addProperty("status", "error");
                testResult.addProperty("actualOutput", runResult.getOutput());
                break;

            case "completed":
                String actualOutput = runResult.getOutput().trim();
                String expected = expectedOutput.trim();

                if (actualOutput.equals(expected)) {
                    testResult.addProperty("status", "passed");
                } else {
                    testResult.addProperty("status", "failed");
                }
                testResult.addProperty("actualOutput", actualOutput);
                break;

            default:
                testResult.addProperty("status", "error");
                testResult.addProperty("actualOutput", "Unknown execution status");
                break;
        }

        logger.debug("Test case {}: status={}", id, testResult.get("status").getAsString());
        return testResult;
    }

    /**
     * Extracts the public class name from Java source code.
     * Falls back to "Main" if no public class declaration is found.
     */
    private String extractClassName(String code) {
        java.util.regex.Pattern classPattern = java.util.regex.Pattern.compile("public\\s+class\\s+(\\w+)");
        java.util.regex.Matcher matcher = classPattern.matcher(code);
        if (matcher.find()) {
            return matcher.group(1);
        }
        return "Main";
    }
}
