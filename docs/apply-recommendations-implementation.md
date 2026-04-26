# Apply Recommendations Implementation Note

## What was implemented
Pulse CV now includes a post-analysis **Apply recommendations** workflow that appears only after a completed analysis and only when an original CV source file is available.

The workflow includes:
- `Apply recommendations` action in the Analyzer results screen
- edit-plan preview before file generation
- updated CV generation in the same input format
- downloadable change report / redline summary
- DOCX-first surgical editing path
- transparent PDF fallback path

## Files added
- `server/cvApply/types.ts`
- `server/cvApply/editPlan.ts`
- `server/cvApply/storage.ts`
- `server/cvApply/pythonWorker.ts`
- `scripts/cv_apply_worker.py`
- `requirements-doc-worker.txt`

## Files updated
- `server.ts`
- `src/App.tsx`
- `Dockerfile`

## Chosen libraries
### DOCX editing
- `python-docx`

Why:
- strongest practical choice in the current stack for paragraph-aware DOCX editing
- allows targeted paragraph replacement / insertion
- preserves much more styling and section structure than full regeneration

### PDF generation fallback
- `reportlab`

Why:
- reliable recruiter-safe regenerated PDF output
- honest fallback when exact layout-preserving PDF editing is not realistic

## Why DOCX and PDF paths differ
DOCX is structurally editable and supports a true surgical patch path.
PDF is not a reliable semantic editing format for exact high-fidelity rewriting across arbitrary source files.

Therefore:
- DOCX input -> DOCX output with high-fidelity targeted edits
- PDF input -> PDF output in recruiter-safe fallback mode when exact layout preservation cannot be guaranteed

## Fidelity guarantees
### DOCX
Reasonable guarantees:
- preserve paragraph order
- preserve headings and section flow
- preserve most paragraph styling where possible
- preserve contact details and chronology
- patch only targeted sections when possible

### PDF
Honest guarantee:
- preserve content intent and same output format
- generate recruiter-readable / ATS-readable PDF
- do not guarantee exact original visual layout for arbitrary PDFs

## Safety rules enforced
- no invented tools, degrees, titles, achievements, or experience
- dates and chronology are preserved unless intentionally edited
- recommendations are applied only through Pulse CV analysis output
- AI is not used as the source of truth for scoring or fit logic
- only `FinalCvPatch.replacementText` may enter DOCX generation
- `DisplayRecommendation.message` is UI-only and can never be written into the CV
- multilingual meta-language validation runs before patch creation and again inside the DOCX worker
- if a generated patch contains advice, conditional wording, UI labels, or language mismatch, the download is blocked

## Multilingual repair architecture
Pulse CV now separates:
- `DisplayRecommendation`
- `InternalEditInstruction`
- `FinalCvPatch`

The core product rule is:

```text
Analyze in any language.
Recommend in the UI layer.
Patch only in the CV language.
Patch only with evidence.
Never write advice into the CV.
```

## Implemented API
- `POST /api/cv/apply-recommendations/plan`
- `POST /api/cv/apply-recommendations/generate`
- `GET /api/cv/generation/:jobId/status`
- `GET /api/cv/generation/:jobId/download`
- `GET /api/cv/generation/:jobId/redline`

## Validation completed
- local lint passed
- local build passed
- Python worker compilation passed
- DOCX end-to-end generation passed
- PDF end-to-end fallback generation passed

## Current limitations
- DOCX is the happy path and the strongest implementation today
- PDF output is intentionally transparent fallback, not fake exact-layout editing
- server orchestration still lives partly in `server.ts` and can be modularized further later
