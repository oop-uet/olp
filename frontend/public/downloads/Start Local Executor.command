#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

JAR_NAME="oop-local-executor-1.0.0.jar"

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

if ! command -v java >/dev/null 2>&1; then
  echo "ERROR: Chua cai Java/JDK hoac lenh java khong nam trong PATH."
  echo "Hay cai JDK 17+ tu https://adoptium.net/ roi chay lai."
  echo ""
  read -r -p "Nhan Enter de dong cua so..."
  exit 1
fi

echo "Dang khoi dong Local Executor tai ws://localhost:9876"
echo "Giu cua so nay mo trong luc lam bai."
echo "Nhan Ctrl+C de dung."
echo ""

java -jar "$JAR_NAME"

echo ""
read -r -p "Local Executor da dung. Nhan Enter de dong cua so..."
