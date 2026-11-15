@echo off
setlocal enabledelayedexpansion
title TeXNote - LaTeX Studio (by IRSpace)
color 0B

echo ========================================================================
echo          _____        __ _   _       _       
echo         ^|_   _^|____  _\ \ ^| ^| ^| ___ ^| ^|_ ___ 
echo           ^| ^| / _ \ \/ /\ ^|  ^\^| ^|/ _ \^| __/ _ \
echo           ^| ^|^|  __/^>  ^< / ^| ^|\  ^| (_) ^| ^|^|  __/
echo           ^|_^| \___/_/\_\\_^|_^| \_^|\___/ \__\___^|
echo.
echo                  (by IRSpace - Rijwan Ansari)
echo ========================================================================
echo.

color 0E
echo [*] Initializing TeXNote Environment...

:: Detect WSL distro (TeXNote dedicated distro or Ubuntu)
set DISTRO=
wsl.exe -d TeXNote -- echo ok >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set DISTRO=TeXNote
) else (
    wsl.exe -d Ubuntu -- echo ok >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        set DISTRO=Ubuntu
    )
)

if "%DISTRO%"=="" (
    color 0C
    echo [-] Error: No compatible TeXNote WSL engine found!
    echo     Please run 'TeXNote_Setup_v1.0.exe' to install the engine.
    pause
    exit /b 1
)

color 0A
echo [+] Engine detected: WSL (%DISTRO%)
color 0E

:: Start persistent keepalive so WSL2 does not idle suspend
start /b wsl.exe -d %DISTRO% -u root -- sleep infinity >nul 2>&1

:: Ensure services are active
wsl.exe -d %DISTRO% -u root -- systemctl is-active --quiet overleaf.service
if %ERRORLEVEL% NEQ 0 (
    echo [*] Starting TeXNote background services in %DISTRO%...
    wsl.exe -d %DISTRO% -u root -- systemctl start overleaf.service
) else (
    echo [*] Backend service is running in %DISTRO%.
)

echo [*] Connecting to TeXNote server on port 7777...
set /a ATTEMPTS=0

:WAIT_LOOP
set /a ATTEMPTS+=1
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:7777/status' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    goto SERVER_ONLINE
)

if %ATTEMPTS% GEQ 35 (
    color 0C
    echo.
    echo [-] Timed out waiting for TeXNote server on port 7777.
    pause
    exit /b 1
)

<nul set /p=.
timeout /t 1 /nobreak >nul
goto WAIT_LOOP

:SERVER_ONLINE
echo.
color 0A
echo [+] TeXNote Server is ONLINE!
echo.
color 0B
echo [*] Opening your default browser at: http://localhost:7777
start http://localhost:7777
echo.
echo ------------------------------------------------------------------------
color 0F
echo  TeXNote Server is active and ready.
echo  URL: http://localhost:7777
echo.
echo  Keep this Command Prompt window open while using TeXNote.
echo  Press Ctrl+C in this window to stop the server.
color 08
echo ------------------------------------------------------------------------
echo.

:WATCHDOG_LOOP
timeout /t 5 /nobreak >nul
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:7777/status' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [*] Service blip detected, restoring TeXNote services...
    start /b wsl.exe -d %DISTRO% -u root -- sleep infinity >nul 2>&1
    wsl.exe -d %DISTRO% -u root -- systemctl start overleaf.service >nul 2>&1
)
goto WATCHDOG_LOOP
