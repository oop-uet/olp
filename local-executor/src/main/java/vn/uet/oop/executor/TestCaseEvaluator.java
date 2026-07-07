package vn.uet.oop.executor;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Compares actual program output against expected output for each test case.
 * Orchestrates the full compile-and-run workflow and returns structured JSON results.
 */
public class TestCaseEvaluator {

    private static final Logger logger = LoggerFactory.getLogger(TestCaseEvaluator.class);
    private static final String JAVA_TEST_MARKER = "__OOP_JAVA_TEST__";
    private static final int DEFAULT_JUNIT_TIMEOUT_SECONDS = 10;
    private static final String JAVA_REFLECTION_SOURCE = """
            package net.bqc.oasis.junit;

            import java.lang.reflect.Field;
            import java.lang.reflect.Method;
            import java.lang.reflect.Modifier;

            public class JavaReflection {
                public static Method getMethod(Class<?> clazz, String name, Class<?> returnType, String access, String modifier, Class<?>... parameterTypes) {
                    try {
                        Method method = clazz.getDeclaredMethod(name, parameterTypes);
                        if (returnType != null && !method.getReturnType().equals(returnType)) {
                            return null;
                        }
                        if (!matchesAccess(method.getModifiers(), access) || !matchesModifier(method.getModifiers(), modifier)) {
                            return null;
                        }
                        method.setAccessible(true);
                        return method;
                    } catch (Exception e) {
                        return null;
                    }
                }

                public static Field getField(Class<?> clazz, String name) {
                    try {
                        Field field = clazz.getDeclaredField(name);
                        field.setAccessible(true);
                        return field;
                    } catch (Exception e) {
                        return null;
                    }
                }

                public static boolean checkField(Class<?> clazz, String name, String typePattern) {
                    return checkField(clazz, name, typePattern, "");
                }

                public static boolean checkField(Class<?> clazz, String name, String typePattern, String access) {
                    Field field = getField(clazz, name);
                    if (field == null) {
                        return false;
                    }
                    String actualType = field.getType().getName();
                    boolean typeMatches = false;
                    for (String expectedType : typePattern.split("\\\\|")) {
                        String trimmed = expectedType.trim();
                        if (actualType.equals(trimmed) || field.getType().getSimpleName().equals(trimmed)) {
                            typeMatches = true;
                            break;
                        }
                    }
                    return typeMatches && matchesAccess(field.getModifiers(), access);
                }

                private static boolean matchesAccess(int modifiers, String access) {
                    if (access == null || access.isBlank()) {
                        return true;
                    }
                    return switch (access) {
                        case "private" -> Modifier.isPrivate(modifiers);
                        case "protected" -> Modifier.isProtected(modifiers);
                        case "public" -> Modifier.isPublic(modifiers);
                        case "package", "default" -> !Modifier.isPrivate(modifiers) && !Modifier.isProtected(modifiers) && !Modifier.isPublic(modifiers);
                        default -> true;
                    };
                }

                private static boolean matchesModifier(int modifiers, String modifier) {
                    if (modifier == null || modifier.isBlank()) {
                        return true;
                    }
                    return switch (modifier) {
                        case "static" -> Modifier.isStatic(modifiers);
                        case "final" -> Modifier.isFinal(modifiers);
                        default -> true;
                    };
                }
            }
            """;

    private final CodeCompiler compiler;
    private final CodeRunner runner;
    private final String jdkPath;

    public TestCaseEvaluator(String jdkPath) {
        this.jdkPath = jdkPath;
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
        return evaluate(List.of(new CodeCompiler.SourceFile(extractClassName(code) + ".java", code)), null, testCases);
    }

    /**
     * Evaluates one or more Java source files against a set of test cases.
     */
    public JsonObject evaluate(List<CodeCompiler.SourceFile> files, String requestedMainClass, JsonArray testCases) {
        JsonObject result = new JsonObject();
        result.addProperty("type", "result");

        // Step 1: Compile the code
        CodeCompiler.CompilationResult compilationResult = compiler.compileFiles(files);

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

        // Evaluate code style (Checkstyle) programmatically
        JsonObject styleResult = StyleChecker.checkStyle(workDir, files);
        result.add("styleResult", styleResult);

        String className = requestedMainClass != null && !requestedMainClass.isBlank()
                ? requestedMainClass
                : findMainClass(files);

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
        if (isJavaTestCase(testCase)) {
            return runJavaTestCase(workDir, testCase);
        }

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

    private boolean isJavaTestCase(JsonObject testCase) {
        if (testCase.has("type") && "java_junit".equals(testCase.get("type").getAsString())) {
            return true;
        }
        if (testCase.has("input")) {
            return testCase.get("input").getAsString().startsWith(JAVA_TEST_MARKER);
        }
        return false;
    }

    private JsonObject runJavaTestCase(Path workDir, JsonObject testCase) {
        String id = testCase.has("id") ? testCase.get("id").getAsString() : "unknown";
        String input = testCase.has("input") ? testCase.get("input").getAsString() : "";
        String testSource = testCase.has("expectedOutput") ? testCase.get("expectedOutput").getAsString() : "";
        int timeLimit = testCase.has("timeLimit") ? testCase.get("timeLimit").getAsInt() : DEFAULT_JUNIT_TIMEOUT_SECONDS;
        if (timeLimit <= 0) {
            timeLimit = DEFAULT_JUNIT_TIMEOUT_SECONDS;
        }

        long start = System.currentTimeMillis();
        JsonObject testResult = new JsonObject();
        testResult.addProperty("id", id);

        try {
            String testFileName = sanitizeJavaFileName(getJavaTestFileName(input, testSource));
            String testClassName = testFileName.replaceFirst("\\.java$", "");

            Path reflectionDir = workDir.resolve("net").resolve("bqc").resolve("oasis").resolve("junit");
            Files.createDirectories(reflectionDir);
            Files.writeString(reflectionDir.resolve("JavaReflection.java"), JAVA_REFLECTION_SOURCE);
            Files.writeString(workDir.resolve(testFileName), testSource);

            String classpath = getRuntimeClasspath(workDir);
            ProcessBuilder compileBuilder = new ProcessBuilder(
                    getJavacPath(),
                    "-encoding",
                    "UTF-8",
                    "-cp",
                    classpath,
                    testFileName,
                    "net/bqc/oasis/junit/JavaReflection.java"
            );
            compileBuilder.directory(workDir.toFile());
            compileBuilder.redirectErrorStream(true);
            Process compileProcess = compileBuilder.start();
            String compileOutput = readProcessOutput(compileProcess);
            int compileExit = compileProcess.waitFor();
            if (compileExit != 0) {
                testResult.addProperty("status", "error");
                testResult.addProperty("actualOutput", compileOutput.trim());
                testResult.addProperty("executionTimeMs", System.currentTimeMillis() - start);
                return testResult;
            }

            ProcessBuilder runBuilder = new ProcessBuilder(
                    getJavaPath(),
                    "-cp",
                    classpath,
                    "org.junit.runner.JUnitCore",
                    testClassName
            );
            runBuilder.directory(workDir.toFile());
            runBuilder.redirectErrorStream(true);
            Process runProcess = runBuilder.start();
            boolean finished = runProcess.waitFor(timeLimit, TimeUnit.SECONDS);
            if (!finished) {
                runProcess.destroyForcibly();
                testResult.addProperty("status", "timeout");
                testResult.addProperty("actualOutput", "JUnit test timed out after " + timeLimit + " seconds");
                testResult.addProperty("executionTimeMs", System.currentTimeMillis() - start);
                return testResult;
            }

            String output = readProcessOutput(runProcess).trim();
            testResult.addProperty("status", runProcess.exitValue() == 0 ? "passed" : "failed");
            testResult.addProperty("actualOutput", output);
            testResult.addProperty("executionTimeMs", System.currentTimeMillis() - start);
            return testResult;
        } catch (Exception e) {
            testResult.addProperty("status", "error");
            testResult.addProperty("actualOutput", e.getMessage());
            testResult.addProperty("executionTimeMs", System.currentTimeMillis() - start);
            return testResult;
        }
    }

    private String getJavaTestFileName(String input, String source) {
        String[] lines = input.split("\\R", 3);
        if (lines.length >= 2 && lines[1].endsWith(".java")) {
            return lines[1].trim();
        }

        Pattern classPattern = Pattern.compile("public\\s+class\\s+(\\w+)");
        Matcher matcher = classPattern.matcher(source);
        if (matcher.find()) {
            return matcher.group(1) + ".java";
        }
        return "MyTest.java";
    }

    private String sanitizeJavaFileName(String name) {
        String trimmed = name == null ? "" : name.trim();
        if (!trimmed.matches("[A-Za-z_$][\\w$]*\\.java")) {
            throw new IllegalArgumentException("Invalid Java test file name: " + name);
        }
        return trimmed;
    }

    private String getRuntimeClasspath(Path workDir) {
        String separator = File.pathSeparator;
        String javaClasspath = System.getProperty("java.class.path", "");
        if (javaClasspath.isBlank()) {
            return workDir.toString();
        }

        String[] entries = javaClasspath.split(Pattern.quote(separator));
        List<String> absoluteEntries = new ArrayList<>();
        for (String entry : entries) {
            if (entry == null || entry.isBlank()) {
                continue;
            }
            File file = new File(entry);
            absoluteEntries.add(file.isAbsolute() ? file.getAbsolutePath() : file.getAbsoluteFile().getAbsolutePath());
        }

        return workDir + separator + String.join(separator, absoluteEntries);
    }

    private String getJavacPath() {
        if (jdkPath != null && !jdkPath.isBlank()) {
            String executable = System.getProperty("os.name").toLowerCase().contains("win")
                    ? "javac.exe"
                    : "javac";
            String javac = jdkPath + File.separator + "bin" + File.separator + executable;
            if (new File(javac).exists()) {
                return javac;
            }
        }
        return "javac";
    }

    private String getJavaPath() {
        if (jdkPath != null && !jdkPath.isBlank()) {
            String executable = System.getProperty("os.name").toLowerCase().contains("win")
                    ? "java.exe"
                    : "java";
            String java = jdkPath + File.separator + "bin" + File.separator + executable;
            if (new File(java).exists()) {
                return java;
            }
        }
        return "java";
    }

    private String readProcessOutput(Process process) throws java.io.IOException {
        StringBuilder output = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                output.append(line).append("\n");
            }
        }
        return output.toString();
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

    private String findMainClass(List<CodeCompiler.SourceFile> files) {
        for (CodeCompiler.SourceFile file : files) {
            if (file.content().contains("public static void main")) {
                return file.name().replaceFirst("\\.java$", "");
            }
        }

        for (CodeCompiler.SourceFile file : files) {
            java.util.regex.Pattern classPattern = java.util.regex.Pattern.compile("public\\s+class\\s+(\\w+)");
            java.util.regex.Matcher matcher = classPattern.matcher(file.content());
            if (matcher.find()) {
                return matcher.group(1);
            }
        }

        return files.isEmpty() ? "Main" : files.get(0).name().replaceFirst("\\.java$", "");
    }
}
