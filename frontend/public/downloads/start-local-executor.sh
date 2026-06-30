#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

JAR_NAME="oop-local-executor-1.0.0.jar"

if [ ! -f "$JAR_NAME" ]; then
  echo "ERROR: Khong tim thay $JAR_NAME trong thu muc hien tai."
  echo "Hay giai nen day du file ZIP roi chay lai."
  exit 1
fi

if ! command -v java >/dev/null 2>&1; then
  echo "ERROR: Chua cai Java/JDK hoac lenh java khong nam trong PATH."
  echo "Hay cai JDK 17+ tu https://adoptium.net/ roi chay lai."
  exit 1
fi

echo "Dang khoi dong Local Executor tai ws://127.0.0.1:9876"
echo "Giu terminal nay mo trong luc lam bai. Nhan Ctrl+C de dung."
java -jar "$JAR_NAME"
