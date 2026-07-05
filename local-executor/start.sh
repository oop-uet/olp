#!/usr/bin/env bash
#
# OOP Local Executor - Unix/macOS Startup Script
# Starts the local code execution server for the OOP Learning Platform.
#
# Usage:
#   ./start.sh          # Start on default port 9876
#   ./start.sh 9999     # Start on custom port 9999
#

set -e

JAR_NAME="oop-local-executor-1.0.0.jar"
DEFAULT_PORT=9876
JAVA_CMD=""

# Resolve script directory (so the script works from any working directory)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
JAR_PATH="$SCRIPT_DIR/$JAR_NAME"

find_java() {
    if command -v java >/dev/null 2>&1; then
        JAVA_CMD="$(command -v java)"
        return 0
    fi

    if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ]; then
        JAVA_CMD="$JAVA_HOME/bin/java"
        return 0
    fi

    local candidates=(
        "$HOME/.jdks"/*
        "$HOME/Library/Java/JavaVirtualMachines"/*/Contents/Home
        "/Library/Java/JavaVirtualMachines"/*/Contents/Home
        "/Applications/IntelliJ IDEA.app/Contents/jbr/Contents/Home"
        "/Applications/IntelliJ IDEA CE.app/Contents/jbr/Contents/Home"
        "$HOME/Library/Application Support/JetBrains/Toolbox/apps/IDEA-U/ch-0"/*/IntelliJ\ IDEA.app/Contents/jbr/Contents/Home
        "$HOME/Library/Application Support/JetBrains/Toolbox/apps/IDEA-C/ch-0"/*/IntelliJ\ IDEA\ CE.app/Contents/jbr/Contents/Home
        "$HOME/.local/share/JetBrains/Toolbox/apps/IDEA-U/ch-0"/*/jbr
        "$HOME/.local/share/JetBrains/Toolbox/apps/IDEA-C/ch-0"/*/jbr
        "/usr/lib/jvm"/*
        "/opt/idea"/*/jbr
    )

    local candidate
    for candidate in "${candidates[@]}"; do
        if [ -x "$candidate/bin/java" ]; then
            JAVA_CMD="$candidate/bin/java"
            return 0
        fi
    done

    return 1
}

# Check if JAR file exists
if [ ! -f "$JAR_PATH" ]; then
    echo "ERROR: $JAR_NAME not found in $SCRIPT_DIR"
    echo ""
    echo "Build it from source:"
    echo "  mvn clean package"
    echo ""
    echo "Or download it from the releases page."
    exit 1
fi

# Check if Java is available. PATH is not required; IntelliJ/JetBrains JDKs
# are detected automatically when possible.
if ! find_java; then
    echo "ERROR: Java/JDK was not found."
    echo ""
    echo "The launcher checked PATH, JAVA_HOME, IntelliJ IDEA, JetBrains Toolbox,"
    echo "the user's .jdks folder, and common JDK installation folders."
    echo ""
    echo "If IntelliJ is installed, open IntelliJ > File > Project Structure > SDKs"
    echo "and install/add a JDK 17+ SDK. Then run this file again."
    echo ""
    echo "Fast option: install JDK 17+ from https://adoptium.net/"
    exit 1
fi

export JAVA_HOME="$(cd "$(dirname "$JAVA_CMD")/.." && pwd)"

# Check Java version
JAVA_VERSION=$("$JAVA_CMD" -version 2>&1 | head -n 1 | cut -d'"' -f2 | cut -d'.' -f1)
if [ "$JAVA_VERSION" -lt 17 ] 2>/dev/null; then
    echo "ERROR: Java 17 or higher is required. Found version: $JAVA_VERSION"
    echo ""
    echo "Please update your JDK installation."
    exit 1
fi

# Determine port
PORT="${1:-$DEFAULT_PORT}"

echo "============================================"
echo "  OOP Local Executor"
echo "  Port: $PORT"
echo "  Java: $JAVA_CMD"
echo "  JAVA_HOME: $JAVA_HOME"
echo "  JDK:  $("$JAVA_CMD" -version 2>&1 | head -n 1)"
echo "============================================"
echo ""
echo "Starting server... Press Ctrl+C to stop."
echo ""

# Run the JAR
exec "$JAVA_CMD" -jar "$JAR_PATH" "$PORT"
