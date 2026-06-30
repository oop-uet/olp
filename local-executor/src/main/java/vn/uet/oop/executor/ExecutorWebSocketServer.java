package vn.uet.oop.executor;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonSyntaxException;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.InetSocketAddress;

/**
 * WebSocket server that handles connections from the OOP Learning Platform browser client.
 * Listens on localhost:9876 and processes compile_and_run requests.
 * 
 * Message routing by "type" field:
 * - "status" -> reports whether the executor and JDK are ready
 * - "compile_and_run" -> delegates to code execution
 * - "ping" -> responds with {type: "pong"}
 */
public class ExecutorWebSocketServer extends WebSocketServer {

    private static final Logger logger = LoggerFactory.getLogger(ExecutorWebSocketServer.class);
    private final Gson gson = new Gson();
    private final boolean jdkAvailable;
    private final String jdkPath;

    public ExecutorWebSocketServer(int port, boolean jdkAvailable, String jdkPath) {
        super(new InetSocketAddress("localhost", port));
        this.jdkAvailable = jdkAvailable;
        this.jdkPath = jdkPath;
        // Set connection lost timeout
        setConnectionLostTimeout(60);
    }

    @Override
    public void onOpen(WebSocket conn, ClientHandshake handshake) {
        String clientAddress = conn.getRemoteSocketAddress().toString();
        logger.info("New connection from: {}", clientAddress);
    }

    @Override
    public void onClose(WebSocket conn, int code, String reason, boolean remote) {
        String clientAddress = conn.getRemoteSocketAddress() != null
                ? conn.getRemoteSocketAddress().toString()
                : "unknown";
        logger.info("Connection closed: {} (code={}, reason={}, remote={})",
                clientAddress, code, reason, remote);
    }

    @Override
    public void onMessage(WebSocket conn, String message) {
        logger.debug("Received message: {}", message);

        try {
            JsonObject request = gson.fromJson(message, JsonObject.class);

            if (request == null || !request.has("type")) {
                sendError(conn, "INVALID_MESSAGE", "Message must contain a 'type' field");
                return;
            }

            String type = request.get("type").getAsString();
            routeMessage(conn, type, request);

        } catch (JsonSyntaxException e) {
            sendError(conn, "INVALID_JSON", "Failed to parse message as JSON: " + e.getMessage());
        } catch (Exception e) {
            logger.error("Error processing message", e);
            sendError(conn, "INTERNAL_ERROR", "An unexpected error occurred: " + e.getMessage());
        }
    }

    @Override
    public void onError(WebSocket conn, Exception ex) {
        if (conn != null) {
            logger.error("WebSocket error on connection {}: {}",
                    conn.getRemoteSocketAddress(), ex.getMessage());
        } else {
            logger.error("WebSocket server error: {}", ex.getMessage());
        }
    }

    @Override
    public void onStart() {
        logger.info("WebSocket server started successfully on port {}", getPort());
    }

    /**
     * Routes incoming messages by their "type" field to appropriate handlers.
     */
    private void routeMessage(WebSocket conn, String type, JsonObject request) {
        switch (type) {
            case "ping":
                handlePing(conn);
                break;

            case "status":
                handleStatus(conn);
                break;

            case "compile_and_run":
                handleCompileAndRun(conn, request);
                break;

            default:
                sendError(conn, "UNKNOWN_TYPE",
                        "Unknown message type: '" + type + "'. Supported types: ping, status, compile_and_run");
                break;
        }
    }

    /**
     * Responds to ping messages with a pong.
     */
    private void handlePing(WebSocket conn) {
        JsonObject response = new JsonObject();
        response.addProperty("type", "pong");
        sendJson(conn, response);
    }

    /**
     * Reports readiness to the browser before students can start an exercise.
     */
    private void handleStatus(WebSocket conn) {
        JsonObject response = new JsonObject();
        response.addProperty("type", "status");
        response.addProperty("ready", jdkAvailable);
        response.addProperty("port", getPort());
        response.addProperty("version", Main.VERSION);
        response.addProperty("jdkAvailable", jdkAvailable);
        if (jdkPath != null && !jdkPath.isBlank()) {
            response.addProperty("jdkPath", jdkPath);
        }
        if (!jdkAvailable) {
            response.addProperty("code", "JDK_NOT_FOUND");
            response.addProperty("message",
                    "JDK (Java Development Kit) is not installed or not detected on this machine.");
            response.addProperty("setupInstructions", JdkDetector.getSetupInstructions());
        }
        sendJson(conn, response);
    }

    /**
     * Handles compile_and_run requests.
     * First checks if JDK is available, then delegates to code execution.
     */
    private void handleCompileAndRun(WebSocket conn, JsonObject request) {
        if (!jdkAvailable) {
            JsonObject error = new JsonObject();
            error.addProperty("type", "error");
            error.addProperty("code", "JDK_NOT_FOUND");
            error.addProperty("message",
                    "JDK (Java Development Kit) is not installed or not detected on this machine.");
            error.addProperty("setupInstructions", JdkDetector.getSetupInstructions());
            sendJson(conn, error);
            return;
        }

        // Validate required fields
        if (!request.has("code") || request.get("code").getAsString().isBlank()) {
            sendError(conn, "INVALID_REQUEST", "Request must contain a non-empty 'code' field");
            return;
        }

        if (!request.has("testCases") || !request.get("testCases").isJsonArray()) {
            sendError(conn, "INVALID_REQUEST", "Request must contain a 'testCases' array");
            return;
        }

        String code = request.get("code").getAsString();
        JsonArray testCases = request.getAsJsonArray("testCases");

        logger.info("Received compile_and_run request: {} chars of code, {} test cases",
                code.length(), testCases.size());

        // Execute compilation and test evaluation
        TestCaseEvaluator evaluator = new TestCaseEvaluator(jdkPath);
        JsonObject result = evaluator.evaluate(code, testCases);

        sendJson(conn, result);
    }

    /**
     * Sends a structured error response to the client.
     */
    private void sendError(WebSocket conn, String code, String message) {
        JsonObject error = new JsonObject();
        error.addProperty("type", "error");
        error.addProperty("code", code);
        error.addProperty("message", message);
        sendJson(conn, error);
    }

    /**
     * Sends a JSON object to the connected client.
     */
    private void sendJson(WebSocket conn, JsonObject json) {
        if (conn != null && conn.isOpen()) {
            String jsonStr = gson.toJson(json);
            conn.send(jsonStr);
            logger.debug("Sent: {}", jsonStr);
        }
    }
}
