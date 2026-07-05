package vn.uet.oop.executor;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.*;
import java.nio.file.Path;

/**
 * Executes compiled Java code with test case input piped to stdin.
 * Captures stdout output for comparison against expected results.
 */
public class CodeRunner {

    private static final Logger logger = LoggerFactory.getLogger(CodeRunner.class);

    private final String jdkPath;
    private final TimeoutManager timeoutManager;

    public CodeRunner(String jdkPath, TimeoutManager timeoutManager) {
        this.jdkPath = jdkPath;
        this.timeoutManager = timeoutManager;
    }

    /**
     * Result of running compiled code with a test case.
     */
    public static class RunResult {
        private final String status; // "completed", "timeout", "runtime_error"
        private final String output;
        private final long executionTimeMs;

        public RunResult(String status, String output, long executionTimeMs) {
            this.status = status;
            this.output = output;
            this.executionTimeMs = executionTimeMs;
        }

        public String getStatus() {
            return status;
        }

        public String getOutput() {
            return output;
        }

        public long getExecutionTimeMs() {
            return executionTimeMs;
        }
    }

    /**
     * Runs the compiled class with the given input piped to stdin.
     *
     * @param workDir      the directory containing the compiled .class file
     * @param className    the name of the class to run
     * @param input        the input to pipe to stdin (can be null or empty)
     * @param timeLimit    the time limit in seconds for this test case (0 uses default)
     * @return RunResult with status, output, and execution time
     */
    public RunResult run(Path workDir, String className, String input, int timeLimit) {
        long startTime = System.currentTimeMillis();

        try {
            // Build java command
            String javaPath = getJavaPath();
            ProcessBuilder pb = new ProcessBuilder(javaPath, className);
            pb.directory(workDir.toFile());
            pb.redirectErrorStream(true);

            // Start the process
            Process process = pb.start();

            // Pipe input to stdin
            if (input != null && !input.isEmpty()) {
                try (OutputStream stdin = process.getOutputStream()) {
                    stdin.write(input.getBytes());
                    stdin.flush();
                }
            } else {
                process.getOutputStream().close();
            }

            // Wait for process with timeout
            boolean completed;
            if (timeLimit > 0) {
                completed = timeoutManager.waitFor(process, timeLimit);
            } else {
                completed = timeoutManager.waitFor(process);
            }

            long executionTimeMs = System.currentTimeMillis() - startTime;

            if (!completed) {
                logger.debug("Process timed out after {}ms", executionTimeMs);
                return new RunResult("timeout", "", executionTimeMs);
            }

            // Read output
            String output = readProcessOutput(process);
            int exitCode = process.exitValue();

            if (exitCode != 0) {
                logger.debug("Process exited with code: {}", exitCode);
                return new RunResult("runtime_error", output, executionTimeMs);
            }

            return new RunResult("completed", output, executionTimeMs);

        } catch (Exception e) {
            long executionTimeMs = System.currentTimeMillis() - startTime;
            logger.error("Error running code", e);
            return new RunResult("runtime_error", "Internal error: " + e.getMessage(), executionTimeMs);
        }
    }

    /**
     * Gets the path to the java executable.
     */
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
        // Fall back to PATH
        return "java";
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
                if (output.length() > 0) {
                    output.append("\n");
                }
                output.append(line);
            }
        }
        return output.toString();
    }
}
