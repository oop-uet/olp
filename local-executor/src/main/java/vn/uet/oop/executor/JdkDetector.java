package vn.uet.oop.executor;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * Detects JDK installation on the student's machine.
 * Checks JAVA_HOME, PATH and common IDE-managed JDK locations.
 */
public class JdkDetector {

    private static final boolean IS_WINDOWS = System.getProperty("os.name")
            .toLowerCase().contains("win");

    /**
     * Attempts to detect a JDK installation on the system.
     * 
     * Check 1: JAVA_HOME environment variable
     * Check 2: `which javac` (Unix) or `where javac` (Windows)
     * Check 3: IntelliJ IDEA / JetBrains managed JDKs
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

        Optional<String> bundledJdk = findBundledJdk();
        if (bundledJdk.isPresent()) {
            return bundledJdk;
        }

        return Optional.empty();
    }

    public static Optional<String> detectJavaRuntime() {
        Optional<String> jdk = detectJdk();
        if (jdk.isPresent()) {
            return findExecutableInHome(jdk.get(), "java").map(File::getAbsolutePath);
        }

        return findExecutableOnPath("java");
    }

    /**
     * Tries to locate javac using the system PATH.
     * Uses `which javac` on Unix or `where javac` on Windows.
     * 
     * @return Optional containing the full path to javac if found
     */
    private static Optional<String> findJavacOnPath() {
        try {
            String[] command = IS_WINDOWS
                    ? new String[]{"where", "javac"}
                    : new String[]{"which", "javac"};

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

    private static Optional<String> findExecutableOnPath(String executableName) {
        try {
            String commandName = IS_WINDOWS ? executableName + ".exe" : executableName;
            String[] command = IS_WINDOWS
                    ? new String[]{"where", commandName}
                    : new String[]{"which", commandName};

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
            // Silently fail; callers will try other locations.
        }

        return Optional.empty();
    }

    private static Optional<String> findBundledJdk() {
        List<File> candidates = new ArrayList<>();
        addEnvCandidate(candidates, "IDEA_JDK");
        addEnvCandidate(candidates, "JDK_HOME");

        if (IS_WINDOWS) {
            addWindowsCandidates(candidates);
        } else if (System.getProperty("os.name").toLowerCase().contains("mac")) {
            addMacCandidates(candidates);
        } else {
            addLinuxCandidates(candidates);
        }

        return candidates.stream()
                .filter(File::exists)
                .flatMap(candidate -> expandJdkCandidates(candidate).stream())
                .filter(JdkDetector::hasJavac)
                .sorted(Comparator.comparing(File::getAbsolutePath).reversed())
                .map(File::getAbsolutePath)
                .findFirst();
    }

    private static void addEnvCandidate(List<File> candidates, String envName) {
        String value = System.getenv(envName);
        if (value != null && !value.isBlank()) {
            candidates.add(new File(value));
        }
    }

    private static void addWindowsCandidates(List<File> candidates) {
        String localAppData = System.getenv("LOCALAPPDATA");
        String userProfile = System.getenv("USERPROFILE");
        String programFiles = System.getenv("ProgramFiles");
        String programFilesX86 = System.getenv("ProgramFiles(x86)");

        addIfPresent(candidates, localAppData, "Programs");
        addIfPresent(candidates, localAppData, "JetBrains");
        addIfPresent(candidates, localAppData, "Programs\\JetBrains");
        addIfPresent(candidates, userProfile, ".jdks");
        addIfPresent(candidates, programFiles, "JetBrains");
        addIfPresent(candidates, programFiles, "Eclipse Adoptium");
        addIfPresent(candidates, programFiles, "Java");
        addIfPresent(candidates, programFilesX86, "JetBrains");
    }

    private static void addMacCandidates(List<File> candidates) {
        String userHome = System.getProperty("user.home");
        addIfPresent(candidates, userHome, "Library/Java/JavaVirtualMachines");
        addIfPresent(candidates, userHome, "Library/Application Support/JetBrains");
        candidates.add(new File("/Applications/IntelliJ IDEA.app/Contents/jbr/Contents/Home"));
        candidates.add(new File("/Applications/IntelliJ IDEA CE.app/Contents/jbr/Contents/Home"));
        candidates.add(new File("/Library/Java/JavaVirtualMachines"));
    }

    private static void addLinuxCandidates(List<File> candidates) {
        String userHome = System.getProperty("user.home");
        addIfPresent(candidates, userHome, ".jdks");
        addIfPresent(candidates, userHome, ".local/share/JetBrains");
        candidates.add(new File("/usr/lib/jvm"));
        candidates.add(new File("/opt/idea"));
    }

    private static void addIfPresent(List<File> candidates, String base, String child) {
        if (base != null && !base.isBlank()) {
            candidates.add(new File(base, child));
        }
    }

    private static List<File> expandJdkCandidates(File candidate) {
        List<File> expanded = new ArrayList<>();
        expanded.add(normalizeJdkHome(candidate));

        if (candidate.isDirectory()) {
            File[] children = candidate.listFiles();
            if (children != null) {
                for (File child : children) {
                    expanded.add(normalizeJdkHome(child));
                    expanded.add(normalizeJdkHome(new File(child, "jbr")));
                    expanded.add(normalizeJdkHome(new File(child, "jbr\\Contents\\Home")));
                    expanded.add(normalizeJdkHome(new File(child, "Contents\\Home")));
                    expanded.add(normalizeJdkHome(new File(child, "Contents/Home")));
                }
            }
        }

        return expanded;
    }

    private static File normalizeJdkHome(File candidate) {
        File contentsHome = new File(candidate, "Contents" + File.separator + "Home");
        if (contentsHome.exists()) {
            return contentsHome;
        }
        return candidate;
    }

    private static boolean hasJavac(File jdkHome) {
        return findExecutableInHome(jdkHome.getAbsolutePath(), "javac").isPresent();
    }

    private static Optional<File> findExecutableInHome(String javaHome, String executableName) {
        String fileName = IS_WINDOWS ? executableName + ".exe" : executableName;
        File executable = new File(javaHome, "bin" + File.separator + fileName);
        if (executable.exists() && executable.canExecute()) {
            return Optional.of(executable);
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
        sb.append("2. Or use the JDK bundled with IntelliJ IDEA / JetBrains Runtime if IntelliJ is installed.\n");
        sb.append("3. Or install via package manager:\n");

        if (IS_WINDOWS) {
            sb.append("   - winget install EclipseAdoptium.Temurin.17.JDK\n");
            sb.append("   - choco install temurin17\n");
        } else if (System.getProperty("os.name").toLowerCase().contains("mac")) {
            sb.append("   - brew install --cask temurin17\n");
        } else {
            sb.append("   - sudo apt install openjdk-17-jdk  (Debian/Ubuntu)\n");
            sb.append("   - sudo dnf install java-17-openjdk-devel  (Fedora)\n");
        }

        sb.append("\nIf IntelliJ is installed, this executor will try to detect its bundled JDK automatically.\n");
        sb.append("If detection still fails, set JAVA_HOME to IntelliJ's JDK folder or install Adoptium JDK 17+.\n");
        sb.append("Restart this executor after installing the JDK.");
        return sb.toString();
    }
}
