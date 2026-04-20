@echo off
setlocal EnableExtensions

cd /d "%~dp0"

if not exist ".sandbox" mkdir ".sandbox"

echo ============================================================
echo PulseCV secure Hugging Face key setup
echo ============================================================
echo.
echo This will ask for your HF token locally and write it to:
echo %CD%\.env
echo.
echo The token will not be printed to the screen.
echo Temporary sandbox files are ignored by git.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File ".\.sandbox\set_hf_key.ps1"
set RESULT=%ERRORLEVEL%

if "%RESULT%"=="0" (
    echo.
    echo [OK] Hugging Face key was saved to .env
    echo [OK] You can now run: run_site_huggingface.bat
) else (
    echo.
    echo [FAIL] Key setup did not complete.
)

echo.
pause
exit /b %RESULT%
