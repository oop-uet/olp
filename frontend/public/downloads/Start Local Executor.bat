@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"
set JAR_NAME=oop-local-executor-1.0.0.jar
set MIN_JAVA_MAJOR=17
set JAVA_CMD=

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

call :find_java

if not defined JAVA_CMD (
  echo ERROR: Khong tim thay Java/JDK 17+.
  echo.
  echo Executor da thu tim trong PATH, JAVA_HOME, IntelliJ IDEA, JetBrains Toolbox,
  echo thu muc .jdks cua nguoi dung va cac thu muc JDK pho bien.
  echo.
  echo Neu da cai IntelliJ, hay mo IntelliJ ^> File ^> Project Structure ^> SDKs
  echo va cai/them JDK 17+ cho project. Sau do chay lai file nay.
  echo.
  echo Cach nhanh nhat: cai JDK 17+ tu https://adoptium.net/
  echo.
  pause
  exit /b 1
)

for %%J in ("!JAVA_CMD!\..\..") do set JAVA_HOME=%%~fJ

echo Dang khoi dong Local Executor tai ws://127.0.0.1:9876
echo Giu cua so nay mo trong luc lam bai.
echo Nhan Ctrl+C de dung.
echo.
echo Dang dung Java: !JAVA_CMD!
echo JAVA_HOME tam thoi: !JAVA_HOME!
echo.

"!JAVA_CMD!" -jar "%JAR_NAME%"

echo.
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

set VERSION_TMP=%TEMP%\oop-local-executor-java-version-%RANDOM%-%RANDOM%.txt
"%CANDIDATE_JAVA%" -version > "%VERSION_TMP%" 2>&1
if not exist "%VERSION_TMP%" exit /b 1

for /f "tokens=3" %%g in ('findstr /i "version" "%VERSION_TMP%"') do (
  set JAVA_VER=%%g
)
del "%VERSION_TMP%" >nul 2>&1

if not defined JAVA_VER exit /b 1
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
