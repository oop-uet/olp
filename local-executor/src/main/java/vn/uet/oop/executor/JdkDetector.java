package vn.uet.oop.executor;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.util.Optional;

/**
 * Detects JDK installation on the student's machine.
 * Checks JAVA_HOME environment variable and PATH for javac/java executables.
 */
public class JdkDetector {

    private static final boolean IS_WINDOWS = System.getProperty("os.name")
            .toLowerCase().contains("win");

    /**
     * Attempts to detect a JDK installation on the system.
     * 
     * Check 1: JAVA_HOME environment variable
     * Check 2: `which javac` (Unix) or `where javac` (Windows)
     * 
     * @return Optional containing the JDK path if found, empty if not
     */
    public static Optional<String> detectJdk() {
        // Check 1: JAVA_HOME environment variable
        String javaHome = System.getenv("JAVA_HOME");
        if (javaHome != null && !javaHome.isBlank()) {
            File javacFile = new File(javaHome, "bin" + File.separator + (IS_WINDOWS ? "javac.exe" : "javac"));
            if (javacFile.exists() && javacFile.canExecute()) {
                return Optional.of(javaHome);
            }
        }

        // Check 2: which javac (Unix) or where javac (Windows)
        Optional<String> javacPath = findJavacOnPath();
        if (javacPath.isPresent()) {
            // Resolve the JDK home from the javac path (go up from bin/javac)
            File javac = new File(javacPath.get());
            File binDir = javac.getParentFile();
            if (binDir != null && binDir.getParentFile() != null) {
                return Optional.of(binDir.getParentFile().getAbsolutePath());
            }
            return javacPath;
        }

        return Optional.empty();
    }

    /**
     * Tries to locate javac using the system PATH.
     * Uses `which javac` on Unix or `where javac` on Windows.
     * 
     * @return Optional containing the full path to javac if found
     */
    private static Optional<String> findJavacOnPath() {
        try {
            String[] command;
            if (IS_WINDOWS) {
                command = new String[]{"where", "javac"};
            } else {
                command = new String[]{"which", "javac"};
            }

            Process process = new ProcessBuilder(command)
                    .redirectErrorStream(true)
                    .start();

            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream()))) {
                String line = reader.readLine();
                int exitCode = process.waitFor();

                if (exitCode == 0 && line != null && !line.isBlank()) {
                    return Optional.of(line.trim());
                }
            }
        } catch (Exception e) {
            // Silently fail — JDK not found via PATH
        }

        return Optional.empty();
    }

    /**
     * Returns setup instructions for installing a JDK.
     */
    public static String getSetupInstructions() {
        StringBuilder sb = new StringBuilder();
        sb.append("JDK (Java Development Kit) is required to compile and run Java code.\n\n");
        sb.append("Installation options:\n");
        sb.append("1. Download from https://adoptium.net/ (recommended)\n");
        sb.append("2. Or install via package manager:\n");

        if (IS_WINDOWS) {
            sb.append("   - winget install EclipseAdoptium.Temurin.17.JDK\n");
            sb.append("   - choco install temurin17\n");
        } else if (System.getProperty("os.name").toLowerCase().contains("mac")) {
            sb.append("   - brew install --cask temurin17\n");
        } else {
            sb.append("   - sudo apt install openjdk-17-jdk  (Debian/Ubuntu)\n");
            sb.append("   - sudo dnf install java-17-openjdk-devel  (Fedora)\n");
        }

        sb.append("\nAfter installation, ensure JAVA_HOME is set and javac is on your PATH.\n");
        sb.append("Restart this executor after installing the JDK.");
        return sb.toString();
    }
}
