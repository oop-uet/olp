@echo off
setlocal

cd /d "%~dp0"
set JAR_NAME=oop-local-executor-1.0.0.jar

echo ============================================
echo   OOP Local Executor
echo ============================================
echo.

if not exist "%JAR_NAME%" (
  echo ERROR: Khong tim thay %JAR_NAME% trong thu muc hien tai.
  echo Hay giai nen day du file ZIP roi chay lai.
  echo.
  pause
  exit /b 1
)

where java >nul 2>nul
if errorlevel 1 (
  echo ERROR: Chua cai Java/JDK hoac lenh java khong nam trong PATH.
  echo Hay cai JDK 17+ tu https://adoptium.net/ roi chay lai.
  echo.
  pause
  exit /b 1
)

echo Dang khoi dong Local Executor tai ws://localhost:9876
echo Giu cua so nay mo trong luc lam bai.
echo Nhan Ctrl+C de dung.
echo.

java -jar "%JAR_NAME%"

echo.
pause
