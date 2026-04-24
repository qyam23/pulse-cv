# Pulse CV Product Audit

## What existed before the pivot
- A working public web app with resume + JD intake.
- Server-side LinkedIn scraping and JD cleanup.
- Provider support for Hugging Face, Gemini, and LM Studio.
- Deterministic scoring had already replaced pure LLM scoring.
- A public UI already existed and was deployable to Hugging Face Space and GitHub Pages.

## What was conceptually broken
- The product still behaved like an ATS score checker.
- Flat keyword matching remained too visible in the UX and API.
- Output mixed extracted facts, inferred facts, and AI wording.
- `Critical Gaps` still surfaced noisy tokens rather than typed requirements.
- `server.ts` concentrated scraping, normalization, matching, scoring, and provider work in one file.

## What was worth preserving
- LinkedIn extraction improvements.
- Public deployment stack.
- File upload and pasted-text intake.
- Server-side provider abstraction.
- Existing multilingual baseline.

## What needed replacement
- Flat keyword-first result model.
- Primary score-led UX.
- Missing recruiter-grade explainability.
- Missing evidence map.
- Missing JD quality review.
- Missing typed requirement schema and domain pack.
