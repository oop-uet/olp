#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

JAR_NAME="oop-local-executor-1.0.0.jar"
MIN_JAVA_MAJOR=17
JAVA_CMD=""

find_java() {
  if [ -n "${JAVA_HOME:-}" ] && try_java "$JAVA_HOME/bin/java"; then
    return 0
  fi

  if command -v java >/dev/null 2>&1; then
    while IFS= read -r candidate; do
      if try_java "$candidate"; then
        return 0
      fi
    done < <(which -a java 2>/dev/null)
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

  return 1
}

detect_java_home() {
  local direct_home runtime_home mac_home

  direct_home="$(cd "$(dirname "$JAVA_CMD")/.." && pwd)"
  if [ "$direct_home" != "/usr" ] && [ -x "$direct_home/bin/javac" ]; then
    echo "$direct_home"
    return 0
  fi

  if [ -x /usr/libexec/java_home ]; then
    mac_home="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
    if [ -n "$mac_home" ] && [ -x "$mac_home/bin/javac" ]; then
      echo "$mac_home"
      return 0
    fi
  fi

  runtime_home="$("$JAVA_CMD" -XshowSettings:properties -version 2>&1 | awk -F'= ' '/java.home =/ {print $2; exit}')"
  if [ -n "$runtime_home" ] && [ -x "$runtime_home/bin/javac" ]; then
    echo "$runtime_home"
    return 0
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

echo "============================================"
echo "  OOP Local Executor"
echo "============================================"
echo ""

if [ ! -f "$JAR_NAME" ]; then
  echo "ERROR: Khong tim thay $JAR_NAME trong thu muc hien tai."
  echo "Hay giai nen day du file ZIP roi chay lai."
  echo ""
  read -r -p "Nhan Enter de dong cua so..."
  exit 1
fi

if ! find_java; then
  echo "ERROR: Khong tim thay Java/JDK 17+."
  echo "Executor da thu tim trong PATH, JAVA_HOME, IntelliJ IDEA, JetBrains Toolbox,"
  echo "thu muc ~/.jdks va cac thu muc JDK pho bien."
  echo ""
  echo "Neu da cai IntelliJ, hay mo IntelliJ > File > Project Structure > SDKs"
  echo "va cai/them JDK 17+ cho project. Sau do chay lai file nay."
  echo ""
  echo "Cach nhanh nhat: cai JDK 17+ tu https://adoptium.net/"
  echo ""
  read -r -p "Nhan Enter de dong cua so..."
  exit 1
fi

if DETECTED_JAVA_HOME="$(detect_java_home)"; then
  export JAVA_HOME="$DETECTED_JAVA_HOME"
else
  unset JAVA_HOME
fi

echo "Dang khoi dong Local Executor tai ws://127.0.0.1:9876"
echo "Giu cua so nay mo trong luc lam bai."
echo "Nhan Ctrl+C de dung."
echo ""
echo "Dang dung Java: $JAVA_CMD"
echo "JAVA_HOME tam thoi: ${JAVA_HOME:-khong dat}"
echo ""

"$JAVA_CMD" -jar "$(pwd)/$JAR_NAME"

echo ""
read -r -p "Local Executor da dung. Nhan Enter de dong cua so..."
