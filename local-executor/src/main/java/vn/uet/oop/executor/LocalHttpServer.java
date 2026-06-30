package vn.uet.oop.executor;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonSyntaxException;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;

/**
 * HTTP fallback API for browsers that cannot open local WebSocket connections.
 */
public class LocalHttpServer {

    private static final Logger logger = LoggerFactory.getLogger(LocalHttpServer.class);
    private final Gson gson = new Gson();
    private final HttpServer server;
    private final int port;
    private final boolean jdkAvailable;
    private final String jdkPath;

    public LocalHttpServer(int port, boolean jdkAvailable, String jdkPath) throws IOException {
        this.port = port;
        this.jdkAvailable = jdkAvailable;
        this.jdkPath = jdkPath;
        this.server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        this.server.setExecutor(Executors.newCachedThreadPool());
        this.server.createContext("/status", this::handleStatus);
        this.server.createContext("/compile-and-run", this::handleCompileAndRun);
    }

    public void start() {
        server.start();
        logger.info("HTTP fallback server started successfully on port {}", port);
    }

    public void stop() {
        server.stop(1);
    }

    private void handleStatus(HttpExchange exchange) throws IOException {
        if (handleOptions(exchange)) return;
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendJson(exchange, 405, error("METHOD_NOT_ALLOWED", "Use GET for /status"));
            return;
        }

        logger.info("HTTP status check from {}", exchange.getRemoteAddress());
        sendJson(exchange, 200, buildStatus());
    }

    private void handleCompileAndRun(HttpExchange exchange) throws IOException {
        if (handleOptions(exchange)) return;
        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendJson(exchange, 405, error("METHOD_NOT_ALLOWED", "Use POST for /compile-and-run"));
            return;
        }

        try (InputStreamReader reader = new InputStreamReader(exchange.getRequestBody(), StandardCharsets.UTF_8)) {
            JsonObject request = gson.fromJson(reader, JsonObject.class);
            JsonObject response = evaluate(request);
            int status = response.has("type") && "error".equals(response.get("type").getAsString()) ? 400 : 200;
            sendJson(exchange, status, response);
        } catch (JsonSyntaxException e) {
            sendJson(exchange, 400, error("INVALID_JSON", "Failed to parse request JSON: " + e.getMessage()));
        } catch (Exception e) {
            logger.error("HTTP compile-and-run failed", e);
            sendJson(exchange, 500, error("INTERNAL_ERROR", "An unexpected error occurred: " + e.getMessage()));
        }
    }

    private JsonObject evaluate(JsonObject request) {
        if (!jdkAvailable) {
            JsonObject error = error("JDK_NOT_FOUND",
                    "JDK (Java Development Kit) is not installed or not detected on this machine.");
            error.addProperty("setupInstructions", JdkDetector.getSetupInstructions());
            return error;
        }

        if (request == null) {
            return error("INVALID_REQUEST", "Request body is required");
        }

        if ((!request.has("code") || request.get("code").getAsString().isBlank())
                && (!request.has("files") || !request.get("files").isJsonArray())) {
            return error("INVALID_REQUEST", "Request must contain a non-empty 'code' field or a 'files' array");
        }

        if (!request.has("testCases") || !request.get("testCases").isJsonArray()) {
            return error("INVALID_REQUEST", "Request must contain a 'testCases' array");
        }

        JsonArray testCases = request.getAsJsonArray("testCases");
        String mainClass = request.has("mainClass") ? request.get("mainClass").getAsString() : null;
        TestCaseEvaluator evaluator = new TestCaseEvaluator(jdkPath);

        if (request.has("files") && request.get("files").isJsonArray()) {
            List<CodeCompiler.SourceFile> files;
            try {
                files = parseSourceFiles(request.getAsJsonArray("files"));
            } catch (IllegalArgumentException e) {
                return error("INVALID_REQUEST", e.getMessage());
            }
            if (files.isEmpty()) {
                return error("INVALID_REQUEST", "Request 'files' array must contain at least one Java source file");
            }
            logger.info("Received HTTP compile-and-run request: {} files, {} test cases",
                    files.size(), testCases.size());
            return evaluator.evaluate(files, mainClass, testCases);
        }

        String code = request.get("code").getAsString();
        logger.info("Received HTTP compile-and-run request: {} chars of code, {} test cases",
                code.length(), testCases.size());
        return evaluator.evaluate(code, testCases);
    }

    private List<CodeCompiler.SourceFile> parseSourceFiles(JsonArray fileArray) {
        List<CodeCompiler.SourceFile> files = new ArrayList<>();

        for (int i = 0; i < fileArray.size(); i++) {
            JsonObject file = fileArray.get(i).getAsJsonObject();
            if (!file.has("name") || !file.has("content")) {
                throw new IllegalArgumentException("Each source file must include name and content");
            }

            String name = file.get("name").getAsString();
            String content = file.get("content").getAsString();
            if (!name.matches("[A-Za-z_$][\\w$]*\\.java")) {
                throw new IllegalArgumentException("Invalid Java file name: " + name);
            }
            if (!content.isBlank()) {
                files.add(new CodeCompiler.SourceFile(name, content));
            }
        }

        return files;
    }

    private JsonObject buildStatus() {
        JsonObject response = new JsonObject();
        response.addProperty("type", "status");
        response.addProperty("ready", jdkAvailable);
        response.addProperty("port", port);
        response.addProperty("version", Main.VERSION);
        response.addProperty("jdkAvailable", jdkAvailable);
        response.addProperty("transport", "http");
        if (jdkPath != null && !jdkPath.isBlank()) {
            response.addProperty("jdkPath", jdkPath);
        }
        if (!jdkAvailable) {
            response.addProperty("code", "JDK_NOT_FOUND");
            response.addProperty("message",
                    "JDK (Java Development Kit) is not installed or not detected on this machine.");
            response.addProperty("setupInstructions", JdkDetector.getSetupInstructions());
        }
        return response;
    }

    private JsonObject error(String code, String message) {
        JsonObject error = new JsonObject();
        error.addProperty("type", "error");
        error.addProperty("code", code);
        error.addProperty("message", message);
        return error;
    }

    private boolean handleOptions(HttpExchange exchange) throws IOException {
        addCorsHeaders(exchange);
        if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return true;
        }
        return false;
    }

    private void sendJson(HttpExchange exchange, int status, JsonObject body) throws IOException {
        addCorsHeaders(exchange);
        byte[] bytes = gson.toJson(body).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }

    private void addCorsHeaders(HttpExchange exchange) {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
        exchange.getResponseHeaders().set("Access-Control-Max-Age", "86400");
    }
}
