@echo off
REM
REM OOP Local Executor - Windows Startup Script
REM Starts the local code execution server for the OOP Learning Platform.
REM
REM Usage:
REM   start.bat          - Start on default port 9876
REM   start.bat 9999     - Start on custom port 9999
REM

setlocal enabledelayedexpansion

set JAR_NAME=oop-local-executor-1.0.0.jar
set DEFAULT_PORT=9876

REM Resolve script directory
set SCRIPT_DIR=%~dp0
set JAR_PATH=%SCRIPT_DIR%%JAR_NAME%

REM Check if JAR file exists
if not exist "%JAR_PATH%" (
    echo ERROR: %JAR_NAME% not found in %SCRIPT_DIR%
    echo.
    echo Build it from source:
    echo   mvn clean package
    echo.
    echo Or download it from the releases page.
    pause
    exit /b 1
)

REM Check if Java is available
where java >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Java is not installed or not in PATH.
    echo.
    echo Please install JDK 17 or higher:
    echo   - Adoptium: https://adoptium.net/
    echo   - Oracle:   https://www.oracle.com/java/technologies/downloads/
    echo.
    echo After installing, make sure 'java' is accessible from your terminal.
    pause
    exit /b 1
)

REM Check Java version
for /f "tokens=3" %%g in ('java -version 2^>^&1 ^| findstr /i "version"') do (
    set JAVA_VER=%%g
)
set JAVA_VER=%JAVA_VER:"=%
for /f "delims=." %%a in ("%JAVA_VER%") do set JAVA_MAJOR=%%a

if %JAVA_MAJOR% LSS 17 (
    echo ERROR: Java 17 or higher is required. Found version: %JAVA_MAJOR%
    echo.
    echo Please update your JDK installation.
    pause
    exit /b 1
)

REM Determine port
set PORT=%DEFAULT_PORT%
if not "%~1"=="" set PORT=%~1

echo ============================================
echo   OOP Local Executor
echo   Port: %PORT%
for /f "tokens=*" %%v in ('java -version 2^>^&1 ^| findstr /i "version"') do echo   JDK:  %%v
echo ============================================
echo.
echo Starting server... Press Ctrl+C to stop.
echo.

REM Run the JAR
java -jar "%JAR_PATH%" %PORT%

pause
