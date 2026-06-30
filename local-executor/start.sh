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

# Resolve script directory (so the script works from any working directory)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
JAR_PATH="$SCRIPT_DIR/$JAR_NAME"

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

# Check if Java is available
if ! command -v java &> /dev/null; then
    echo "ERROR: Java is not installed or not in PATH."
    echo ""
    echo "Please install JDK 17 or higher:"
    echo "  - Adoptium: https://adoptium.net/"
    echo "  - Oracle:   https://www.oracle.com/java/technologies/downloads/"
    echo ""
    echo "After installing, make sure 'java' is accessible from your terminal."
    exit 1
fi

# Check Java version
JAVA_VERSION=$(java -version 2>&1 | head -n 1 | cut -d'"' -f2 | cut -d'.' -f1)
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
echo "  JDK:  $(java -version 2>&1 | head -n 1)"
echo "============================================"
echo ""
echo "Starting server... Press Ctrl+C to stop."
echo ""

# Run the JAR
exec java -jar "$JAR_PATH" "$PORT"
