package vn.uet.oop.executor;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Handles Java code compilation by invoking javac on student code.
 * Captures compilation output including error messages with line numbers.
 */
public class CodeCompiler {

    private static final Logger logger = LoggerFactory.getLogger(CodeCompiler.class);

    // Pattern to parse javac error lines like: Main.java:5: error: ';' expected
    private static final Pattern ERROR_PATTERN = Pattern.compile("^\\w+\\.java:(\\d+):(.+)$");

    private final String jdkPath;

    public CodeCompiler(String jdkPath) {
        this.jdkPath = jdkPath;
    }

    /**
     * Result of a compilation attempt.
     */
    public static class CompilationResult {
        private final boolean success;
        private final JsonArray errors;
        private final Path workDir;

        public CompilationResult(boolean success, JsonArray errors, Path workDir) {
            this.success = success;
            this.errors = errors;
            this.workDir = workDir;
        }

        public boolean isSuccess() {
            return success;
        }

        public JsonArray getErrors() {
            return errors;
        }

        public Path getWorkDir() {
            return workDir;
        }
    }

    /**
     * Compiles the given Java source code.
     * Writes source to a temp directory, invokes javac, and returns results.
     *
     * @param code the Java source code to compile
     * @return CompilationResult with success status and any errors
     */
    public CompilationResult compile(String code) {
        String className = extractClassName(code);
        return compileFiles(List.of(new SourceFile(className + ".java", code)));
    }

    /**
     * Compiles multiple Java source files in the same temporary workspace.
     */
    public CompilationResult compileFiles(List<SourceFile> files) {
        Path tempDir = null;
        try {
            // Create a temporary directory for compilation
            tempDir = Files.createTempDirectory("oop-executor-");
            logger.debug("Created temp directory: {}", tempDir);

            List<String> sourceNames = new ArrayList<>();
            for (SourceFile file : files) {
                String safeName = sanitizeJavaFileName(file.name());
                Path sourceFile = tempDir.resolve(safeName);
                Files.writeString(sourceFile, file.content());
                sourceNames.add(safeName);
                logger.debug("Wrote source to: {}", sourceFile);
            }

            // Build javac command
            String javacPath = getJavacPath();
            List<String> command = new ArrayList<>();
            command.add(javacPath);
            command.addAll(sourceNames);
            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(tempDir.toFile());
            pb.redirectErrorStream(true);

            // Run javac
            Process process = pb.start();
            String output = readProcessOutput(process);
            int exitCode = process.waitFor();

            if (exitCode == 0) {
                logger.debug("Compilation successful");
                return new CompilationResult(true, new JsonArray(), tempDir);
            } else {
                logger.debug("Compilation failed with exit code: {}", exitCode);
                JsonArray errors = parseCompilationErrors(output);
                return new CompilationResult(false, errors, tempDir);
            }

        } catch (Exception e) {
            logger.error("Error during compilation", e);
            JsonArray errors = new JsonArray();
            JsonObject error = new JsonObject();
            error.addProperty("line", 0);
            error.addProperty("message", "Internal error: " + e.getMessage());
            errors.add(error);
            return new CompilationResult(false, errors, tempDir);
        }
    }

    public record SourceFile(String name, String content) {}

    /**
     * Extracts the public class name from Java source code.
     * Falls back to "Main" if no public class declaration is found.
     */
    private String extractClassName(String code) {
        Pattern classPattern = Pattern.compile("public\\s+class\\s+(\\w+)");
        Matcher matcher = classPattern.matcher(code);
        if (matcher.find()) {
            return matcher.group(1);
        }
        return "Main";
    }

    private String sanitizeJavaFileName(String name) {
        String trimmed = name == null ? "" : name.trim();
        if (!trimmed.matches("[A-Za-z_$][\\w$]*\\.java")) {
            throw new IllegalArgumentException("Invalid Java file name: " + name);
        }
        return trimmed;
    }

    /**
     * Gets the path to the javac executable.
     */
    private String getJavacPath() {
        if (jdkPath != null && !jdkPath.isBlank()) {
            String javac = jdkPath + File.separator + "bin" + File.separator + "javac";
            if (new File(javac).exists()) {
                return javac;
            }
        }
        // Fall back to PATH
        return "javac";
    }

    /**
     * Reads all output from a process's input stream.
     */
    private String readProcessOutput(Process process) throws IOException {
        StringBuilder output = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                output.append(line).append("\n");
            }
        }
        return output.toString();
    }

    /**
     * Parses javac error output into structured JSON errors with line numbers.
     */
    private JsonArray parseCompilationErrors(String output) {
        JsonArray errors = new JsonArray();
        String[] lines = output.split("\n");

        for (String line : lines) {
            Matcher matcher = ERROR_PATTERN.matcher(line.trim());
            if (matcher.matches()) {
                JsonObject error = new JsonObject();
                error.addProperty("line", Integer.parseInt(matcher.group(1)));
                error.addProperty("message", matcher.group(2).trim());
                errors.add(error);
            }
        }

        // If no structured errors were parsed, add the raw output as a single error
        if (errors.isEmpty() && !output.isBlank()) {
            JsonObject error = new JsonObject();
            error.addProperty("line", 0);
            error.addProperty("message", output.trim());
            errors.add(error);
        }

        return errors;
    }

    /**
     * Cleans up a temp directory and all its contents.
     */
    public static void cleanup(Path workDir) {
        if (workDir == null) return;
        try {
            Files.walk(workDir)
                    .sorted((a, b) -> b.compareTo(a)) // Delete files before directories
                    .forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException e) {
                            // Best effort cleanup
                        }
                    });
            logger.debug("Cleaned up temp directory: {}", workDir);
        } catch (IOException e) {
            logger.warn("Failed to clean up temp directory: {}", workDir, e);
        }
    }

}
