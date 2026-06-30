package vn.uet.oop.executor;

import java.util.Optional;

/**
 * Entry point for the OOP Local Executor.
 * 
 * This application runs a local WebSocket server on port 9876 that the
 * browser-based OOP Learning Platform connects to for Java code compilation
 * and execution on the student's machine.
 */
public class Main {

    public static final String VERSION = "1.0.0";
    public static final int DEFAULT_PORT = 9876;
    public static final int DEFAULT_HTTP_PORT = 9877;

    public static void main(String[] args) {
        int port = DEFAULT_PORT;
        if (args.length > 0) {
            try {
                port = Integer.parseInt(args[0]);
            } catch (NumberFormatException e) {
                System.err.println("Invalid port number: " + args[0] + ". Using default port " + DEFAULT_PORT);
            }
        }

        System.out.println("OOP Local Executor v" + VERSION);
        System.out.println("========================");

        // Detect JDK installation
        System.out.println("Detecting JDK installation...");
        Optional<String> jdkPath = JdkDetector.detectJdk();

        boolean jdkAvailable;
        String jdkLocation;

        if (jdkPath.isPresent()) {
            jdkAvailable = true;
            jdkLocation = jdkPath.get();
            System.out.println("JDK detected at: " + jdkLocation);
        } else {
            jdkAvailable = false;
            jdkLocation = null;
            System.err.println("WARNING: JDK not found!");
            System.err.println();
            System.err.println(JdkDetector.getSetupInstructions());
            System.err.println();
            System.err.println("The server will start but code execution will be unavailable.");
            System.err.println("Compile and run requests will return JDK_NOT_FOUND errors.");
            System.err.println();
        }

        // Start WebSocket server
        System.out.println("Starting WebSocket server on port " + port + "...");

        ExecutorWebSocketServer server = new ExecutorWebSocketServer(port, jdkAvailable, jdkLocation);
        server.start();
        LocalHttpServer httpServer = null;
        try {
            httpServer = new LocalHttpServer(DEFAULT_HTTP_PORT, jdkAvailable, jdkLocation);
            httpServer.start();
        } catch (Exception e) {
            System.err.println("WARNING: HTTP fallback server could not start on port " + DEFAULT_HTTP_PORT + ".");
            System.err.println("Reason: " + e.getMessage());
        }

        System.out.println("Server started. Waiting for connections at ws://127.0.0.1:" + port);
        System.out.println("HTTP fallback available at http://127.0.0.1:" + DEFAULT_HTTP_PORT + "/status");
        System.out.println("Press Ctrl+C to stop.");

        // Add shutdown hook for graceful shutdown
        LocalHttpServer finalHttpServer = httpServer;
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("\nShutting down server...");
            try {
                if (finalHttpServer != null) {
                    finalHttpServer.stop();
                }
                server.stop(1000);
                System.out.println("Server stopped.");
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                System.err.println("Interrupted during shutdown.");
            }
        }));
    }
}
