# OOP Local Executor

A lightweight Java WebSocket server that compiles and runs student Java code locally. The OOP Learning Platform browser client connects to this executor for real-time code compilation and test case evaluation.

## System Requirements

- **Java JDK 17** or higher installed and accessible via `JAVA_HOME` or system PATH
- Port **9876** available on localhost (or specify a custom port)
- Supported operating systems: Windows 10+, macOS 12+, Linux (Ubuntu 20.04+)

To verify your JDK installation:

```bash
java -version
javac -version
```

Both commands should report version 17 or higher.

## Download

Download `oop-local-executor-1.0.0.jar` from the [Releases page](https://github.com/oop-uet/olp/releases/latest).

## Quick Start

### Option 1: Direct JAR execution

```bash
java -jar oop-local-executor-1.0.0.jar
```

The server starts on `ws://localhost:9876`. Open the OOP Learning Platform in your browser. The exercise workspace only opens after the platform verifies that this executor is ready and a JDK is available.

### Option 2: Using startup scripts

**Unix/macOS:**

```bash
chmod +x start.sh
./start.sh
```

**Windows:**

```cmd
start.bat
```

### Custom Port

To run on a different port (e.g., port 9999):

```bash
java -jar oop-local-executor-1.0.0.jar 9999
```

Or with the startup scripts:

```bash
./start.sh 9999
```

```cmd
start.bat 9999
```

## Building from Source

```bash
mvn clean package
```

The fat JAR (with all dependencies included) will be generated at:

```
target/oop-local-executor-1.0.0.jar
```

## Architecture

```
src/main/java/vn/uet/oop/executor/
├── Main.java                  # Entry point, starts WebSocket server
├── ExecutorWebSocketServer.java # Handles WS connections on port 9876
├── CodeCompiler.java          # Invokes javac, captures output
├── CodeRunner.java            # Invokes java with input, captures output
├── TestCaseEvaluator.java     # Compares actual vs expected output
├── JdkDetector.java           # Detects JDK installation
└── TimeoutManager.java        # Enforces execution time limits
```

## Communication Protocol

The executor communicates with the browser via JSON messages over WebSocket.

### Request (Browser → Executor)

Readiness check:

```json
{
  "type": "status"
}
```

Execution request:

```json
{
  "type": "compile_and_run",
  "code": "public class Main { ... }",
  "testCases": [
    { "input": "5\n3", "expectedOutput": "8" }
  ],
  "timeoutSeconds": 10
}
```

### Response (Executor → Browser)

Ready:

```json
{
  "type": "status",
  "ready": true,
  "version": "1.0.0",
  "jdkAvailable": true
}
```

**Success:**
```json
{
  "type": "result",
  "compiled": true,
  "testResults": [
    { "status": "passed", "input": "5\n3", "expectedOutput": "8", "actualOutput": "8" }
  ]
}
```

**Compilation Failure:**
```json
{
  "type": "result",
  "compiled": false,
  "errors": [
    { "line": 5, "message": "';' expected" }
  ]
}
```

**JDK Not Found:**
```json
{
  "type": "error",
  "code": "JDK_NOT_FOUND",
  "message": "Java JDK not found on this machine",
  "setupInstructions": "Please install JDK 17+ and set JAVA_HOME..."
}
```

## Troubleshooting

### JDK not found

If the executor reports that JDK is not installed:

1. Download and install JDK 17+ from [Adoptium](https://adoptium.net/) or [Oracle](https://www.oracle.com/java/technologies/downloads/)
2. Set the `JAVA_HOME` environment variable to point to your JDK installation directory
3. Add `$JAVA_HOME/bin` (Unix) or `%JAVA_HOME%\bin` (Windows) to your system `PATH`
4. Verify installation by running `javac -version`

### Port already in use

If port 9876 is already in use:

- Another instance of the executor may be running. Close it first.
- Use a custom port: `java -jar oop-local-executor-1.0.0.jar 9999`
- On Unix, find the process using the port: `lsof -i :9876`
- On Windows, find the process: `netstat -ano | findstr :9876`

### Connection refused in browser

- Make sure the executor JAR is running before opening the platform
- Verify the port matches what the platform expects (default: 9876)
- Check that no firewall is blocking localhost connections

### Java version too old

If you see `UnsupportedClassVersionError`:

- Your Java runtime is older than version 17
- Update to JDK 17 or higher and try again

## License

Internal tool for UET-VNU OOP course. Not for redistribution.
