package vn.uet.oop.executor;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.puppycrawl.tools.checkstyle.Checker;
import com.puppycrawl.tools.checkstyle.ConfigurationLoader;
import com.puppycrawl.tools.checkstyle.PropertiesExpander;
import com.puppycrawl.tools.checkstyle.api.AuditEvent;
import com.puppycrawl.tools.checkstyle.api.AuditListener;
import com.puppycrawl.tools.checkstyle.api.Configuration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public class StyleChecker {

    private static final Logger logger = LoggerFactory.getLogger(StyleChecker.class);

    public static JsonObject checkStyle(Path workDir, List<CodeCompiler.SourceFile> sourceFiles) {
        JsonObject result = new JsonObject();
        result.addProperty("provider", "checkstyle");
        result.addProperty("toolVersion", "checkstyle-local-executor-" + Main.VERSION);
        result.addProperty("status", "passed");
        result.addProperty("score", 100.0);
        result.addProperty("violationCount", 0);
        result.addProperty("feedback", "Không phát hiện lỗi Checkstyle theo cấu hình UET OASIS.");
        
        JsonArray violationsJson = new JsonArray();
        result.add("violations", violationsJson);

        List<File> filesToCheck = new ArrayList<>();
        for (CodeCompiler.SourceFile sf : sourceFiles) {
            Path filePath = workDir.resolve(CodeCompiler.sanitizeJavaFileName(sf.name()));
            if (filePath.toFile().exists()) {
                filesToCheck.add(filePath.toFile());
            }
        }

        if (filesToCheck.isEmpty()) {
            return result;
        }

        try {
            Path configPath = writeUetCheckstyleConfig(workDir);
            Configuration config = ConfigurationLoader.loadConfiguration(
                    configPath.toString(),
                    new PropertiesExpander(System.getProperties())
            );

            Checker checker = new Checker();
            checker.setModuleClassLoader(StyleChecker.class.getClassLoader());
            checker.configure(config);

            List<JsonObject> violationsList = new ArrayList<>();

            checker.addListener(new AuditListener() {
                @Override
                public void auditStarted(AuditEvent event) {}

                @Override
                public void auditFinished(AuditEvent event) {}

                @Override
                public void fileStarted(AuditEvent event) {}

                @Override
                public void fileFinished(AuditEvent event) {}

                @Override
                public void addError(AuditEvent event) {
                    JsonObject violation = new JsonObject();
                    String fileName = new File(event.getFileName()).getName();
                    violation.addProperty("file", fileName);
                    violation.addProperty("line", event.getLine());
                    violation.addProperty("column", event.getColumn());
                    violation.addProperty("severity", event.getSeverityLevel().getName());
                    violation.addProperty("message", event.getMessage());
                    violation.addProperty("source", event.getSourceName());
                    violationsList.add(violation);
                }

                @Override
                public void addException(AuditEvent event, Throwable throwable) {
                    logger.error("Checkstyle file exception", throwable);
                }
            });

            checker.process(filesToCheck);
            checker.destroy();

            int violationCount = violationsList.size();
            double penaltyPerViolation = 5.0;
            int maxViolations = 20;
            int countedViolations = Math.min(violationCount, maxViolations);
            double score = Math.max(0.0, 100.0 - countedViolations * penaltyPerViolation);

            for (JsonObject v : violationsList) {
                violationsJson.add(v);
            }

            result.addProperty("status", violationCount == 0 ? "passed" : "failed");
            result.addProperty("score", score);
            result.addProperty("violationCount", violationCount);
            result.addProperty(
                    "feedback",
                    violationCount == 0
                            ? "Không phát hiện lỗi Checkstyle theo cấu hình UET OASIS."
                            : "Phát hiện " + violationCount + " lỗi Checkstyle. Điểm quy tắc lập trình: " + score + "/100."
            );

        } catch (Exception e) {
            logger.error("Checkstyle execution failed programmatically", e);
            result.addProperty("status", "unavailable");
            result.addProperty("error", e.getMessage());
            result.addProperty("feedback", "Không chạy được Checkstyle trên Local Executor: " + e.getMessage());
        }

        return result;
    }

    private static Path writeUetCheckstyleConfig(Path workDir) throws IOException {
        try (InputStream input = StyleChecker.class.getClassLoader().getResourceAsStream("google_checks.xml")) {
            if (input == null) {
                throw new IOException("Không tìm thấy google_checks.xml trong Checkstyle runtime.");
            }
            String googleChecks = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            String uetChecks = googleChecks
                    .replace("<property name=\"basicOffset\" value=\"2\"/>", "<property name=\"basicOffset\" value=\"4\"/>")
                    .replace("<property name=\"braceAdjustment\" value=\"2\"/>", "<property name=\"braceAdjustment\" value=\"4\"/>")
                    .replace("<property name=\"caseIndent\" value=\"2\"/>", "<property name=\"caseIndent\" value=\"4\"/>")
                    .replace("<property name=\"arrayInitIndent\" value=\"2\"/>", "<property name=\"arrayInitIndent\" value=\"4\"/>");
            Path configPath = workDir.resolve("uet_google_checks_4space.xml");
            Files.writeString(configPath, uetChecks, StandardCharsets.UTF_8);
            return configPath;
        }
    }
}
