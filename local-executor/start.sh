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
MIN_JAVA_MAJOR=17
JAVA_CMD=""

# Resolve script directory (so the script works from any working directory)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
JAR_PATH="$SCRIPT_DIR/$JAR_NAME"

find_java() {
    if [ -n "${JAVA_HOME:-}" ] && try_java "$JAVA_HOME/bin/java"; then
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
        if try_java "$candidate/bin/java"; then
            return 0
        fi
    done

    if command -v java >/dev/null 2>&1; then
        while IFS= read -r candidate; do
            if try_java "$candidate"; then
                return 0
            fi
        done < <(which -a java 2>/dev/null)
    fi

    return 1
}

java_major() {
    local version
    version=$("$1" -version 2>&1 | awk -F\" '/version/ {print $2; exit}')
    if [[ "$version" == 1.* ]]; then
        echo "$version" | cut -d. -f2
    else
        echo "$version" | cut -d. -f1 | sed 's/[^0-9].*//'
    fi
}

try_java() {
    local candidate="$1"
    [ -x "$candidate" ] || return 1

    local major
    major="$(java_major "$candidate")"
    if [ -n "$major" ] && [ "$major" -ge "$MIN_JAVA_MAJOR" ] 2>/dev/null; then
        JAVA_CMD="$candidate"
        return 0
    fi

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
    echo "ERROR: Java/JDK 17+ was not found."
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
