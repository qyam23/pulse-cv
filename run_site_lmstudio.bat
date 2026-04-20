@echo off
setlocal EnableExtensions EnableDelayedExpansion

echo ============================================================
echo PulseCV Local UX Runner - LM Studio / Gemma 3
echo ============================================================
echo.

cd /d "%~dp0"

set PORT=3000
set AI_PROVIDER=lmstudio
set LM_STUDIO_BASE_URL=http://localhost:1234/v1
set DETECTED_MODEL=
set MSTY_GEMMA_MANIFEST=%APPDATA%\Msty\models\manifests\registry.ollama.ai\library\gemma3\latest

echo [1/5] Checking Node dependencies...
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
echo [2/5] Checking LM Studio local server...
curl -s -o nul -w "%%{http_code}" %LM_STUDIO_BASE_URL%/models > tmp_lms_status.txt 2>&1
set /p LMS_STATUS=<tmp_lms_status.txt
del tmp_lms_status.txt >nul 2>&1

if not "%LMS_STATUS%"=="200" (
    echo [WARN] LM Studio server is not running on %LM_STUDIO_BASE_URL%
    echo [ACTION] Open LM Studio ^> Local Server ^> Start Server
    echo [INFO] The site will still open, but AI analysis will show a local AI warning until LM Studio is running.
    if exist "%MSTY_GEMMA_MANIFEST%" (
        echo [INFO] Found Gemma 3 on disk through MSTY:
        echo        %MSTY_GEMMA_MANIFEST%
        echo [INFO] Model name to load/use: gemma3:latest
    )
) else (
    echo [OK] LM Studio server is running
    echo [3/5] Detecting loaded model...
    node -e "const http=require('http');const req=http.request({hostname:'localhost',port:1234,path:'/v1/models',method:'GET',headers:{'Content-Type':'application/json'}},res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>{try{const parsed=JSON.parse(data);const models=parsed.data||[];if(!models.length){console.log('NO_MODEL');return;}const selected=models.find(m=>m.id.toLowerCase().includes('deepseek')&&m.id.toLowerCase().includes('r1'))||models.find(m=>m.id.toLowerCase().includes('gemma3')||m.id.toLowerCase().includes('gemma-3'))||models[0];console.log(selected.id);}catch(e){console.log('NO_MODEL');}})});req.on('error',()=>console.log('NO_MODEL'));req.end();" > tmp_model_id.txt 2>&1
    set /p DETECTED_MODEL=<tmp_model_id.txt
    del tmp_model_id.txt >nul 2>&1

    if "%DETECTED_MODEL%"=="NO_MODEL" (
        echo [WARN] LM Studio is running, but no model is loaded.
        echo [ACTION] Open LM Studio ^> My Models ^> Load DeepSeek-R1 or Gemma 3.
    ) else (
        set LM_STUDIO_MODEL=%DETECTED_MODEL%
        echo [OK] Using local model: %LM_STUDIO_MODEL%
    )
)

echo.
echo [4/5] Stopping old PulseCV server processes if any...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Where-Object { $_.CommandLine -match 'server.ts' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
ping 127.0.0.1 -n 2 >nul

echo.
echo [5/5] Starting PulseCV...
echo ------------------------------------------------------------
echo URL:              http://localhost:%PORT%
echo AI_PROVIDER:      %AI_PROVIDER%
echo LM Studio URL:    %LM_STUDIO_BASE_URL%
if defined LM_STUDIO_MODEL echo LM Studio model:  %LM_STUDIO_MODEL%
echo ------------------------------------------------------------
echo.

start "PulseCV Local Site" cmd /k "npm.cmd run dev"
ping 127.0.0.1 -n 6 >nul
start "" "http://localhost:%PORT%"

echo PulseCV is starting in a separate terminal.
echo If AI is unavailable, start LM Studio Local Server and reload the page.
echo.
pause
