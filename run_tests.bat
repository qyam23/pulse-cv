@echo off
setlocal EnableExtensions EnableDelayedExpansion

echo ============================================================
echo PulseCV Local Validation Runner
echo ============================================================
echo.

set FAILED=0
set LMS_AVAILABLE=0
set DETECTED_MODEL=

echo [1/7] TypeScript lint
call npm.cmd run lint
if errorlevel 1 (
    echo [FAIL] TypeScript lint failed
    set FAILED=1
) else (
    echo [OK] TypeScript lint passed
)

echo.
echo [2/7] Vite production build
call npm.cmd run build
if errorlevel 1 (
    echo [FAIL] Vite build failed
    set FAILED=1
) else (
    echo [OK] Vite build passed
)

echo.
echo [3/7] Bundle audit - no provider keys in frontend bundle
powershell -NoProfile -ExecutionPolicy Bypass -Command "$patterns=@('GEMINI_API_KEY','HUGGING_FACE_API_KEY','apiKey','GoogleGenAI','@google/genai'); $hits=@(); foreach($p in $patterns){ $hits += Select-String -Path 'dist/assets/*.js' -Pattern $p -SimpleMatch -ErrorAction SilentlyContinue }; if($hits.Count -gt 0){ $hits | ForEach-Object { Write-Host ('[HIT] ' + $_.Line) }; exit 1 } else { Write-Host '[OK] No provider secrets or client SDK markers found in bundle' }"
if errorlevel 1 (
    echo [FAIL] Bundle audit failed
    set FAILED=1
) else (
    echo [OK] Bundle audit passed
)

echo.
echo [4/7] Intelligence assets JSON validation
powershell -NoProfile -ExecutionPolicy Bypass -Command "$failed=$false; Get-ChildItem 'intelligence/assets/v1/*.json' | ForEach-Object { try { $json=Get-Content $_.FullName -Raw | ConvertFrom-Json; if(-not $json._meta){ Write-Host ('[FAIL] Missing _meta: ' + $_.Name); $failed=$true } else { Write-Host ('[OK] ' + $_.Name) } } catch { Write-Host ('[FAIL] Invalid JSON: ' + $_.Name + ' ' + $_.Exception.Message); $failed=$true } }; if($failed){ exit 1 }"
if errorlevel 1 (
    echo [FAIL] Intelligence asset validation failed
    set FAILED=1
) else (
    echo [OK] Intelligence assets are valid
)

echo.
echo [5/7] Server startup and endpoint health
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Where-Object { $_.CommandLine -match 'server.ts' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
ping 127.0.0.1 -n 2 >nul
if exist server_test.log del server_test.log >nul 2>&1
start "PulseCV Test Server" /min cmd /c "node .\node_modules\tsx\dist\cli.mjs server.ts > server_test.log 2>&1"
ping 127.0.0.1 -n 6 >nul

curl -s -o nul -w "%%{http_code}" http://localhost:3000/ > tmp_status.txt 2>&1
set /p APP_STATUS=<tmp_status.txt
del tmp_status.txt >nul 2>&1

if not "%APP_STATUS%"=="200" (
    echo [FAIL] App did not respond with 200 on http://localhost:3000/
    type server_test.log
    set FAILED=1
) else (
    echo [OK] App responded on http://localhost:3000/
)

echo.
echo [6/7] SSRF protection check
curl -s -o nul -w "%%{http_code}" -H "Content-Type: application/json" -d "{\"url\":\"http://localhost/test\"}" http://localhost:3000/api/scrape > tmp_status.txt 2>&1
set /p SSRF_STATUS=<tmp_status.txt
del tmp_status.txt >nul 2>&1

if "%SSRF_STATUS%"=="400" (
    echo [OK] localhost SSRF attempt blocked
) else (
    echo [FAIL] localhost SSRF attempt was not blocked. Status: %SSRF_STATUS%
    set FAILED=1
)

echo.
echo Checking LM Studio local server...
curl -s -o nul -w "%%{http_code}" http://localhost:1234/v1/models > tmp_lms_status.txt 2>&1
set /p LMS_STATUS=<tmp_lms_status.txt
del tmp_lms_status.txt >nul 2>&1

if not "%LMS_STATUS%"=="200" (
    echo [WARN] LM Studio server not running on port 1234
    echo [WARN] Open LM Studio ^> Local Server ^> Start Server
    echo [SKIP] Skipping AI test
    set LMS_AVAILABLE=0
) else (
    echo [OK] LM Studio server is running
    set LMS_AVAILABLE=1
)

if "%LMS_AVAILABLE%"=="1" (
    echo Detecting loaded model in LM Studio...
    node -e "const http=require('http');const req=http.request({hostname:'localhost',port:1234,path:'/v1/models',method:'GET',headers:{'Content-Type':'application/json'}},res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>{try{const parsed=JSON.parse(data);const models=parsed.data||[];if(!models.length){console.log('NO_MODEL');return;}const preferred=models.find(m=>m.id.toLowerCase().includes('deepseek')&&m.id.toLowerCase().includes('r1'))||models.find(m=>m.id.toLowerCase().includes('gemma3')||m.id.toLowerCase().includes('gemma-3'))||models[0];console.log(preferred.id);}catch(e){console.log('NO_MODEL');}})});req.on('error',()=>console.log('NO_MODEL'));req.end();" > tmp_model_id.txt 2>&1

    set /p DETECTED_MODEL=<tmp_model_id.txt
    del tmp_model_id.txt >nul 2>&1

    if "%DETECTED_MODEL%"=="NO_MODEL" (
        echo [WARN] No model loaded in LM Studio
        echo [WARN] Open LM Studio ^> My Models ^> Load a model
        echo [SKIP] Skipping AI test
        set LMS_AVAILABLE=0
    ) else (
        echo [OK] Detected model: %DETECTED_MODEL%
    )
)

if "%LMS_AVAILABLE%"=="1" (
    echo.
    echo [7/7] Running AI analysis with LM Studio: %DETECTED_MODEL%
    echo Creating test fixtures...

    node -e "const fs=require('fs');const resume=`John Smith\nSenior Software Engineer\n\nEXPERIENCE\nSoftware Engineer, TechCorp (2020-2024)\n- Built React dashboards for 50k+ users\n- Reduced API latency by 40%% using Redis caching\n- Led team of 4 engineers\n\nJunior Developer, StartupXYZ (2018-2020)\n- Developed Python microservices\n- Worked with PostgreSQL and REST APIs\n\nSKILLS\nJavaScript, React, Python, Node.js, PostgreSQL, Redis, Git, Docker\n\nEDUCATION\nB.Sc Computer Science, Tel Aviv University, 2018`;const jd=`Senior Full Stack Engineer\nRequired:\n- 5+ years experience with React and Node.js\n- Experience with cloud platforms (AWS/GCP)\n- Strong SQL knowledge\n- Must have team leadership experience\n\nNice to have:\n- GraphQL experience\n- Kubernetes`;fs.writeFileSync('test_resume.txt',resume,'utf8');fs.writeFileSync('test_jd.txt',jd,'utf8');console.log('[OK] Test fixtures created');"

    echo Sending to LM Studio for analysis...
    node -e "const http=require('http');const fs=require('fs');const modelId=process.env.DETECTED_MODEL||'%DETECTED_MODEL%';const resume=fs.readFileSync('test_resume.txt','utf8');const jd=fs.readFileSync('test_jd.txt','utf8');const body=JSON.stringify({model:modelId,messages:[{role:'system',content:'You are an expert ATS resume analyzer. Think step by step. Return ONLY valid JSON, no explanation.'},{role:'user',content:`Analyze this resume against the job description.\n\nRESUME:\n${resume}\n\nJOB DESCRIPTION:\n${jd}\n\nReturn ONLY this JSON structure:\n{\n  \"matchScore\": <number 0-100>,\n  \"jobFitDecision\": \"High\" or \"Medium\" or \"Low\",\n  \"topStrengths\": [\"string\", \"string\", \"string\"],\n  \"criticalGaps\": [\"string\", \"string\"],\n  \"recommendation\": \"one sentence action item\"\n}`}],temperature:0.1,max_tokens:600,stream:false});const options={hostname:'localhost',port:1234,path:'/v1/chat/completions',method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer lm-studio','Content-Length':Buffer.byteLength(body)}};console.log('[INFO] Waiting for '+modelId+' response...');const req=http.request(options,res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>{try{const parsed=JSON.parse(data);let content=parsed.choices?.[0]?.message?.content||'';content=content.replace(/<think>[\\s\\S]*?<\\/think>/g,'').trim();content=content.replace(/```json/g,'').replace(/```/g,'').trim();const jsonMatch=content.match(/\\{[\\s\\S]*\\}/);if(!jsonMatch){console.log('[WARN] Could not extract JSON from response');console.log('Raw response preview:',content.substring(0,200));process.exit(0);}const result=JSON.parse(jsonMatch[0]);console.log('');console.log('================================================');console.log('       LM Studio Analysis Result');console.log('================================================');console.log('  Model:       '+modelId);console.log('  Match Score: '+result.matchScore+'/100');console.log('  Job Fit:     '+result.jobFitDecision);console.log('  Strengths:   '+(result.topStrengths||[]).join(' | '));console.log('  Gaps:        '+(result.criticalGaps||[]).join(' | '));console.log('  Action:      '+result.recommendation);console.log('================================================');console.log('[OK] AI analysis completed');}catch(e){console.log('[WARN] Response parse error:',e.message);console.log('[INFO] AI test non-blocking - continuing');}})});req.setTimeout(90000,()=>{console.log('[WARN] AI request timed out after 90s - model may be slow on CPU');console.log('[INFO] AI test non-blocking - continuing');req.destroy();});req.on('error',e=>{console.log('[WARN] LM Studio request failed:',e.message);console.log('[INFO] Make sure LM Studio server is running on port 1234');});req.write(body);req.end();"

    del test_resume.txt test_jd.txt >nul 2>&1
) else (
    echo [7/7] [SKIP] AI test skipped - LM Studio not available
)

echo.
echo Cleaning temporary server process...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Where-Object { $_.CommandLine -match 'server.ts' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
ping 127.0.0.1 -n 2 >nul

echo.
if "%FAILED%"=="1" (
    echo [FAIL] One or more blocking checks failed.
    exit /b 1
)

echo [OK] Blocking checks passed. AI test is non-blocking.
exit /b 0
