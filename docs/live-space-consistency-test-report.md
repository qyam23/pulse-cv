# Pulse CV Live Space Consistency Test Report

## 1. Environment
- Date/time: 2026-04-24T15:51:03.203Z
- Live Space URL: https://qyam23-pulse-cv.hf.space
- Tooling: Node/tsx live API runner, pdfjs-dist PDF extraction, Hugging Face Space HTTP endpoints
- Branch/commit: main @ aea883f
- Health product: Pulse CV - Evidence-Based Hiring Intelligence
- Health scoring mode: evidence-based-deterministic
- Health model: Qwen/Qwen3-32B
- Original CV path: C:\Users\user\Downloads\קורות חיים\new120426\יובל-סטרוסטה קורות חיים.pdf
- Original extracted text length: 3094
- Live root page HTTP status: 200
- Live `/health` HTTP status: 200
- Deployment note: GitHub Actions run `24877811023` checked out commit `aea883f`, but skipped Hugging Face deployment because `HF_TOKEN` was empty.

## 2. Cycle Summaries

| Cycle | Baseline score | Updated score | Baseline must-have | Updated must-have | Baseline confidence | Updated confidence | Improvement? | Notes |
|---|---:|---:|---:|---:|---:|---:|---|---|
| 1 | 56 | N/A | 50 | N/A | 91 | N/A | No | Apply plan failed: 404 Not Found: <!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Cannot POST /api/cv/apply-recommendations/plan</pre>
</body>
</html>
 |
| 2 | 56 | N/A | 50 | N/A | 91 | N/A | No | Apply plan failed: 404 Not Found: <!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Cannot POST /api/cv/apply-recommendations/plan</pre>
</body>
</html>
 |
| 3 | 56 | N/A | 50 | N/A | 91 | N/A | No | Apply plan failed: 404 Not Found: <!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Cannot POST /api/cv/apply-recommendations/plan</pre>
</body>
</html>
 |

| Cycle | Baseline missing items | Updated missing items | Baseline weak evidence | Updated weak evidence | Verdict |
|---|---|---|---|---|---|
| 1 | About the job; ERP; Excel; MES | None | None | None | Failed |
| 2 | About the job; ERP; Excel; MES | None | None | None | Failed |
| 3 | About the job; ERP; Excel; MES | None | None | None | Failed |

## 3. Apply Recommendations Behavior
### Cycle 1
- Apply action available after baseline analysis: no
- Edit-plan preview equivalent returned by API: no
- Generation succeeded: no
- Output format generated: N/A
- Generated file: N/A
- Change report: N/A
- Instruction leakage detected: no

### Cycle 2
- Apply action available after baseline analysis: no
- Edit-plan preview equivalent returned by API: no
- Generation succeeded: no
- Output format generated: N/A
- Generated file: N/A
- Change report: N/A
- Instruction leakage detected: no

### Cycle 3
- Apply action available after baseline analysis: no
- Edit-plan preview equivalent returned by API: no
- Generation succeeded: no
- Output format generated: N/A
- Generated file: N/A
- Change report: N/A
- Instruction leakage detected: no

## 4. Consistency Verdict
- Same-input baseline spread: 0 points
- Baseline scores: 56, 56, 56
- Updated scores: 0, 0, 0
- Apply recommendations behaved consistently: no
- Generated files were free of instruction leakage: yes
- Post-edit CV improved consistently: no

## 5. Final Conclusion
**FAIL**

The baseline deterministic analysis is stable across repeated live runs: score `56`, must-have coverage `50`, confidence `91`, and a same-input spread of `0` points.

The end-to-end Apply Recommendations flow failed because the live Hugging Face Space does not expose `/api/cv/apply-recommendations/plan`. The current GitHub `main` commit includes that endpoint locally, so this is a deployment/runtime mismatch rather than a baseline scoring consistency failure.

Blocking cause found in GitHub Actions: the Hugging Face deploy workflow succeeded technically but exited early with `HF_TOKEN secret is not configured. Skipping Hugging Face Space deployment.` Until the `HF_TOKEN` GitHub secret is configured and the Space is redeployed, the live Space cannot be used to validate generated updated CV files or before/after improvements.

## 6. Artifact Locations
- Local artifact root: C:\Users\user\Documents\Playground\pulse-cv\artifacts\live-space-consistency
- Report path: C:\Users\user\Documents\Playground\pulse-cv\docs\live-space-consistency-test-report.md
