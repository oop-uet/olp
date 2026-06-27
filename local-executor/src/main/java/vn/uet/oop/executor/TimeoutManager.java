package vn.uet.oop.executor;

import java.util.concurrent.TimeUnit;

/**
 * Enforces execution time limits for student code.
 * Uses Process.waitFor(timeout, TimeUnit) to terminate long-running processes.
 */
public class TimeoutManager {

    private static final int DEFAULT_TIMEOUT_SECONDS = 5;

    private final int timeoutSeconds;

    public TimeoutManager() {
        this(DEFAULT_TIMEOUT_SECONDS);
    }

    public TimeoutManager(int timeoutSeconds) {
        if (timeoutSeconds <= 0) {
            this.timeoutSeconds = DEFAULT_TIMEOUT_SECONDS;
        } else {
            this.timeoutSeconds = timeoutSeconds;
        }
    }

    /**
     * Waits for a process to complete within the configured timeout.
     *
     * @param process the process to wait for
     * @return true if the process completed within the timeout, false if it timed out
     * @throws InterruptedException if the thread is interrupted while waiting
     */
    public boolean waitFor(Process process) throws InterruptedException {
        boolean completed = process.waitFor(timeoutSeconds, TimeUnit.SECONDS);
        if (!completed) {
            // Forcefully terminate the process and its descendants
            process.descendants().forEach(ProcessHandle::destroyForcibly);
            process.destroyForcibly();
            process.waitFor(2, TimeUnit.SECONDS); // Allow cleanup time
        }
        return completed;
    }

    /**
     * Waits for a process with a specific timeout override.
     *
     * @param process the process to wait for
     * @param timeoutSeconds the timeout in seconds for this specific execution
     * @return true if the process completed within the timeout, false if it timed out
     * @throws InterruptedException if the thread is interrupted while waiting
     */
    public boolean waitFor(Process process, int timeoutSeconds) throws InterruptedException {
        int effectiveTimeout = timeoutSeconds > 0 ? timeoutSeconds : this.timeoutSeconds;
        boolean completed = process.waitFor(effectiveTimeout, TimeUnit.SECONDS);
        if (!completed) {
            process.descendants().forEach(ProcessHandle::destroyForcibly);
            process.destroyForcibly();
            process.waitFor(2, TimeUnit.SECONDS);
        }
        return completed;
    }

    public int getTimeoutSeconds() {
        return timeoutSeconds;
    }
}
