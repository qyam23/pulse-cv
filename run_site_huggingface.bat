@echo off
setlocal EnableExtensions EnableDelayedExpansion

echo ============================================================
echo PulseCV Local UX Runner - Hugging Face REST API
echo ============================================================
echo.

cd /d "%~dp0"

set PORT=3000
set AI_PROVIDER=huggingface
set HF_MODEL_CANDIDATES=Qwen/Qwen3-32B,deepseek-ai/DeepSeek-R1-Distill-Qwen-32B,Qwen/Qwen2.5-Coder-32B-Instruct

echo [1/4] Checking Node dependencies...
if not exist node_modules (
    echo [INFO] node_modules not found. Installing dependencies with npm ci...
    call npm.cmd ci
    if errorlevel 1 (
        echo [FAIL] npm ci failed.
        pause
        exit /b 1
    )
) else (
    echo [OK] node_modules exists
)

echo.
echo [2/4] Checking Hugging Face token...
if "%HF_TOKEN%"=="" if "%HUGGING_FACE_API_KEY%"=="" (
    echo [WARN] No Hugging Face token found in environment.
    echo [ACTION] Add one of these to .env or Windows environment:
    echo          HF_TOKEN=hf_your_token_here
    echo          HUGGING_FACE_API_KEY=hf_your_token_here
    echo [INFO] The site will open, but AI analysis will fail until a token is configured.
) else (
    echo [OK] Hugging Face token is configured server-side.
)

echo.
echo [3/4] Stopping old PulseCV server processes if any...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Where-Object { $_.CommandLine -match 'server.ts' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
ping 127.0.0.1 -n 2 >nul

echo.
echo [4/4] Starting PulseCV with Hugging Face REST API...
echo ------------------------------------------------------------
echo URL:              http://localhost:%PORT%
echo AI_PROVIDER:      %AI_PROVIDER%
echo HF candidates:    %HF_MODEL_CANDIDATES%
echo REST endpoint:    https://router.huggingface.co/v1/chat/completions
echo ------------------------------------------------------------
echo.

start "PulseCV Hugging Face Site" cmd /k "npm.cmd run dev"
ping 127.0.0.1 -n 6 >nul
start "" "http://localhost:%PORT%"

echo PulseCV is starting in a separate terminal.
echo If AI fails, verify HF_TOKEN/HUGGING_FACE_API_KEY and model availability.
echo.
pause
