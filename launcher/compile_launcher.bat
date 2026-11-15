@echo off
echo ========================================================================
echo        Compiling TeXNote Desktop Runner with csc.exe
echo ========================================================================

set CSC="C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist %CSC% (
    echo Error: C# compiler csc.exe not found at %CSC%
    pause
    exit /b 1
)

echo [*] Compiling TeXNote.exe...
%CSC% /target:exe /out:TeXNote.exe /win32icon:TeXNote.ico Launcher.cs

echo.
echo [+] TeXNote.exe compiled successfully!
echo.
pause
