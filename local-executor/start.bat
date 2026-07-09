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
set MIN_JAVA_MAJOR=17
set JAVA_CMD=

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

REM Check if Java is available. PATH is not required; IntelliJ/JetBrains JDKs
REM are detected automatically when possible.
call :find_java
if not defined JAVA_CMD (
    echo ERROR: Java/JDK 17+ was not found.
    echo.
    echo The launcher checked PATH, JAVA_HOME, IntelliJ IDEA, JetBrains Toolbox,
    echo the user's .jdks folder, and common JDK installation folders.
    echo.
    echo If IntelliJ is installed, open IntelliJ ^> File ^> Project Structure ^> SDKs
    echo and install/add a JDK 17+ SDK. Then run this file again.
    echo.
    echo Fast option: install JDK 17+ from https://adoptium.net/
    pause
    exit /b 1
)

for %%J in ("!JAVA_CMD!\..\..") do set JAVA_HOME=%%~fJ

REM Determine port
set PORT=%DEFAULT_PORT%
if not "%~1"=="" set PORT=%~1

echo ============================================
echo   OOP Local Executor
echo   Port: %PORT%
echo   Java: !JAVA_CMD!
echo   JAVA_HOME: !JAVA_HOME!
for /f "tokens=*" %%v in ('"!JAVA_CMD!" -version 2^>^&1 ^| findstr /i "version"') do echo   JDK:  %%v
echo ============================================
echo.
echo Starting server... Press Ctrl+C to stop.
echo.

REM Run the JAR
"!JAVA_CMD!" -jar "%JAR_PATH%" %PORT%

pause
exit /b 0

:find_java
if defined JAVA_HOME if exist "%JAVA_HOME%\bin\java.exe" (
    call :try_java "%JAVA_HOME%\bin\java.exe"
    if defined JAVA_CMD exit /b 0
)

for /d %%D in ("%USERPROFILE%\.jdks\*") do if exist "%%~fD\bin\java.exe" (
    call :try_java "%%~fD\bin\java.exe"
    if defined JAVA_CMD exit /b 0
)

for /d %%D in ("%LOCALAPPDATA%\Programs\JetBrains\IntelliJ IDEA*") do if exist "%%~fD\jbr\bin\java.exe" (
    call :try_java "%%~fD\jbr\bin\java.exe"
    if defined JAVA_CMD exit /b 0
)

for /d %%D in ("%ProgramFiles%\JetBrains\IntelliJ IDEA*") do if exist "%%~fD\jbr\bin\java.exe" (
    call :try_java "%%~fD\jbr\bin\java.exe"
    if defined JAVA_CMD exit /b 0
)

for /d %%D in ("%LOCALAPPDATA%\JetBrains\Toolbox\apps\IDEA-U\ch-0\*") do if exist "%%~fD\jbr\bin\java.exe" (
    call :try_java "%%~fD\jbr\bin\java.exe"
    if defined JAVA_CMD exit /b 0
)

for /d %%D in ("%LOCALAPPDATA%\JetBrains\Toolbox\apps\IDEA-C\ch-0\*") do if exist "%%~fD\jbr\bin\java.exe" (
    call :try_java "%%~fD\jbr\bin\java.exe"
    if defined JAVA_CMD exit /b 0
)

for /d %%D in ("%ProgramFiles%\Eclipse Adoptium\jdk-*") do if exist "%%~fD\bin\java.exe" (
    call :try_java "%%~fD\bin\java.exe"
    if defined JAVA_CMD exit /b 0
)

for /d %%D in ("%ProgramFiles%\Microsoft\jdk-*") do if exist "%%~fD\bin\java.exe" (
    call :try_java "%%~fD\bin\java.exe"
    if defined JAVA_CMD exit /b 0
)

for /d %%D in ("%ProgramFiles%\Amazon Corretto\jdk*") do if exist "%%~fD\bin\java.exe" (
    call :try_java "%%~fD\bin\java.exe"
    if defined JAVA_CMD exit /b 0
)

for /d %%D in ("%ProgramFiles%\Zulu\zulu-*") do if exist "%%~fD\bin\java.exe" (
    call :try_java "%%~fD\bin\java.exe"
    if defined JAVA_CMD exit /b 0
)

for /d %%D in ("%ProgramFiles%\BellSoft\LibericaJDK-*") do if exist "%%~fD\bin\java.exe" (
    call :try_java "%%~fD\bin\java.exe"
    if defined JAVA_CMD exit /b 0
)

for /d %%D in ("%ProgramFiles%\Java\jdk-*") do if exist "%%~fD\bin\java.exe" (
    call :try_java "%%~fD\bin\java.exe"
    if defined JAVA_CMD exit /b 0
)

for /f "delims=" %%J in ('where java 2^>nul') do (
    call :try_java "%%~fJ"
    if defined JAVA_CMD exit /b 0
)

exit /b 1

:try_java
set CANDIDATE_JAVA=%~1
set JAVA_VER=
set JAVA_MAJOR=
if not exist "%CANDIDATE_JAVA%" exit /b 1

for /f "tokens=3" %%g in ('"%CANDIDATE_JAVA%" -version 2^>^&1 ^| findstr /i "version"') do (
    set JAVA_VER=%%g
)
set JAVA_VER=!JAVA_VER:"=!

for /f "tokens=1,2 delims=." %%a in ("!JAVA_VER!") do (
    if "%%a"=="1" (
        set JAVA_MAJOR=%%b
    ) else (
        set JAVA_MAJOR=%%a
    )
)

if not defined JAVA_MAJOR exit /b 1
if !JAVA_MAJOR! GEQ %MIN_JAVA_MAJOR% (
    set JAVA_CMD=%CANDIDATE_JAVA%
    exit /b 0
)

exit /b 1
