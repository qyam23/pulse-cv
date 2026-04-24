# Pulse CV Live Space Consistency Test Report

## 1. Environment
- Date/time: 2026-04-24T16:57:58.218Z
- Live Space URL: https://qyam23-pulse-cv.hf.space
- Tooling: Node/tsx live API runner, pdfjs-dist PDF extraction, Hugging Face Space HTTP endpoints
- Branch/commit: main @ b42c835
- Health product: Pulse CV - Evidence-Based Hiring Intelligence
- Health scoring mode: evidence-based-deterministic
- Health model: Qwen/Qwen3-32B
- Original CV path: C:\Users\user\Downloads\קורות חיים\new120426\יובל-סטרוסטה קורות חיים.pdf
- Original extracted text length: 3094

## 1A. Executive Summary
**PASS WITH WARNINGS**

The live Hugging Face Space is deployed, running, and exposes the Apply Recommendations API. Three isolated live cycles completed successfully. Baseline scoring is deterministic and stable across all cycles. Updated CV generation now succeeds and returns ATS-safe DOCX files for the Hebrew PDF source.

Warning: the generated CV re-analysis is stable but does not improve the score. Baseline and updated score both remain `56`, with must-have coverage `50`. This means the flow is operational and consistent, but the recommendation application layer is not yet producing measurable score uplift for this test case.

## 1B. Deployment Verification
- GitHub Actions workflow: `Deploy Hugging Face Space`
- Latest successful deploy run used for this test: `24901405680`
- Deployed commit SHA: `b42c835`
- Secret behavior: workflow now supports `secrets.HF_TOKEN || secrets.PULSR_CV`.
- Secret mismatch resolved: yes.
- Hugging Face runtime stage after deploy: `RUNNING`
- `/health`: `200 OK`
- `/api/provider-status`: `200 OK`
- Product: `Pulse CV - Evidence-Based Hiring Intelligence`
- Scoring mode: `evidence-based-deterministic`
- Provider: `huggingface`
- Model: `Qwen/Qwen3-32B`

## 1C. Endpoint Verification
| Endpoint | Status |
|---|---|
| `/api/cv/apply-recommendations/plan` | Available; returned valid edit plan during all cycles |
| `/api/cv/apply-recommendations/generate` | Available; generated output during all cycles |
| `/api/cv/generation/:jobId/status` | Available; returned generation status/output metadata |
| `/api/cv/generation/:jobId/download` | Available; downloaded updated DOCX files |
| `/api/cv/generation/:jobId/redline` | Available; downloaded change reports |

## 2. Cycle Summaries

| Cycle | Baseline score | Updated score | Baseline must-have | Updated must-have | Baseline confidence | Updated confidence | Improvement? | Notes |
|---|---:|---:|---:|---:|---:|---:|---|---|
| 1 | 56 | 56 | 50 | 50 | 91 | 91 | No | Second-pass analysis did not show directional improvement. |
| 2 | 56 | 56 | 50 | 50 | 91 | 91 | No | Second-pass analysis did not show directional improvement. |
| 3 | 56 | 56 | 50 | 50 | 91 | 91 | No | Second-pass analysis did not show directional improvement. |

| Cycle | Baseline missing items | Updated missing items | Baseline weak evidence | Updated weak evidence | Verdict |
|---|---|---|---|---|---|
| 1 | About the job; ERP; Excel; MES | About the job; ERP; Excel; MES | None | None | No directional improvement |
| 2 | About the job; ERP; Excel; MES | About the job; ERP; Excel; MES | None | None | No directional improvement |
| 3 | About the job; ERP; Excel; MES | About the job; ERP; Excel; MES | None | None | No directional improvement |

## 3. Apply Recommendations Behavior
### Cycle 1
- Apply action available after baseline analysis: yes
- Edit-plan preview equivalent returned by API: yes
- Generation succeeded: yes
- Output format generated: docx
- Generated file: C:\Users\user\Documents\Playground\pulse-cv\artifacts\live-space-consistency-rerun-20260424-165515\cycle-1\updated-cv.docx
- Change report: C:\Users\user\Documents\Playground\pulse-cv\artifacts\live-space-consistency-rerun-20260424-165515\cycle-1\change-report.md
- Instruction leakage detected: no

### Cycle 2
- Apply action available after baseline analysis: yes
- Edit-plan preview equivalent returned by API: yes
- Generation succeeded: yes
- Output format generated: docx
- Generated file: C:\Users\user\Documents\Playground\pulse-cv\artifacts\live-space-consistency-rerun-20260424-165515\cycle-2\updated-cv.docx
- Change report: C:\Users\user\Documents\Playground\pulse-cv\artifacts\live-space-consistency-rerun-20260424-165515\cycle-2\change-report.md
- Instruction leakage detected: no

### Cycle 3
- Apply action available after baseline analysis: yes
- Edit-plan preview equivalent returned by API: yes
- Generation succeeded: yes
- Output format generated: docx
- Generated file: C:\Users\user\Documents\Playground\pulse-cv\artifacts\live-space-consistency-rerun-20260424-165515\cycle-3\updated-cv.docx
- Change report: C:\Users\user\Documents\Playground\pulse-cv\artifacts\live-space-consistency-rerun-20260424-165515\cycle-3\change-report.md
- Instruction leakage detected: no

## 4. Consistency Verdict
- Same-input baseline spread: 0 points
- Baseline scores: 56, 56, 56
- Updated scores: 56, 56, 56
- Apply recommendations behaved consistently: yes
- Generated files were free of instruction leakage: yes
- Post-edit CV improved consistently: no
- Drift detected: no score drift across baseline or updated runs
- Live app aligned with GitHub main: yes, after deploy commit `b42c835`

## 4A. Generated File Quality
| Cycle | File opens/downloads | Text extractable | Instruction leakage | Coaching/planner text | Recruiter-facing format | Notes |
|---|---|---|---|---|---|---|
| 1 | Yes | Yes | No | No | Acceptable DOCX fallback | Source PDF was converted to ATS-safe DOCX to avoid Hebrew PDF text-order corruption |
| 2 | Yes | Yes | No | No | Acceptable DOCX fallback | Same output behavior as cycle 1 |
| 3 | Yes | Yes | No | No | Acceptable DOCX fallback | Same output behavior as cycle 1 |

## 4B. Final Blocker List
- No deployment blocker remains.
- No endpoint blocker remains.
- No instruction leakage was detected.
- Remaining product-quality warning: Apply Recommendations did not improve the measured score for this test case. The generated DOCX is stable and re-analyzable, but the edit plan does not yet create measurable evidence uplift for missing requirements such as `ERP`, `Excel`, and `MES`.
- Next recommended action: improve the edit-plan generator so it only applies truthful wording that strengthens already-supported evidence, and separately marks missing real experience that cannot be fixed by phrasing.

## 5. Final Conclusion
**PASS WITH WARNINGS**

The live workflow is operational and generated clean files, but one or more cycles showed limited/no score movement or measurable drift that should be reviewed before treating the flow as fully validated.

## 6. Artifact Locations
- Local artifact root: C:\Users\user\Documents\Playground\pulse-cv\artifacts\live-space-consistency-rerun-20260424-165515
- Report path: C:\Users\user\Documents\Playground\pulse-cv\docs\live-space-consistency-rerun-report.md
