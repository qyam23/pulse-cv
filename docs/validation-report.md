# Validation Report

## Scope
This validation report covers the first evidence-based pivot release for the manufacturing vertical.

## Checked in this release
- Typed requirement extraction from pasted JD text
- Typed requirement extraction from LinkedIn job pages
- Requirement-by-requirement evidence mapping from CV text
- Grouped result rendering in the public UI
- Evidence Map rendering
- JD Quality Review rendering
- Manufacturing benchmark scaffolding and starter fixtures
- Product and quality telemetry capture
- New parse endpoints:
  - `/api/jd/parse`
  - `/api/cv/parse`
  - `/api/jd/lint`
  - `/api/analytics/summary`
- Backward-compatible fields still present in `/api/analyze`

## What the release now proves
- The product no longer depends on flat keyword matching as its primary output model.
- Requirements are grouped and typed.
- Each requirement can carry evidence, support level, and confidence.
- The final score is decomposed and secondary.
- The UI exposes uncertainty and JD quality warnings.

## Commands executed successfully
- `npm run lint`
- `npm run build`
- `npm run benchmark:manufacturing`
- `POST /api/analyze` against a pasted Hebrew factory-engineer JD
- `POST /api/scrape` against LinkedIn job URL `https://www.linkedin.com/jobs/view/4398015632/`

## Local runtime checks
- `GET /health`
  - returned `product=Pulse CV - Evidence-Based Hiring Intelligence`
  - returned `scoringMode=evidence-based-deterministic`
  - returned `vertical=manufacturing`
- `GET /`
  - returned HTTP 200 locally
- `POST /api/jd/parse`
  - returned typed requirement groups for a manufacturing JD
- `POST /api/analyze`
  - returned decomposed scoring, evidence map, JD quality warnings, and candidate/recruiter recommendations
- `GET /api/analytics/summary`
  - returned telemetry summary JSON

## Behavior checks confirmed
- Strong manufacturing-fit sample produced:
  - explicit tool matches (`AutoCAD`, `SolidWorks`)
  - explicit methods/domain matches (`Continuous Improvement`, `Quality Management`, `Manufacturing`)
  - decomposed score instead of flat ATS-only output
- Partial-fit industrial leader sample stayed meaningfully lower than the strong-fit case
- Maintenance-heavy sample against manufacturing-engineer JD stayed low-fit and exposed real tool/domain gaps
- Seniority extraction no longer emits a flat `individual_contributor` requirement for non-leadership roles
- Must-have calibration is stricter:
  - role title and years-experience remain mandatory by default
  - tools, education, and language only become must-haves when the JD wording actually marks them as required
  - broad domain/methodology signals are no longer auto-promoted to must-have unless the source line carries explicit requirement context
- AI no longer overrides deterministic recommendations or bullet rewrites
- AI no longer overrides the deterministic profile summary / tailored bio in the main payload

## Remaining weaknesses
- Manufacturing pack is curated and useful, but still compact rather than benchmark-complete.
- Recruiter and hiring manager views are beta-level surfaces, not separate polished products yet.
- AI rewrite quality still depends on provider availability.
- Benchmark scaffolding now exists, but a full human-reviewed corpus is still a next-step task.

## Benchmark harness
- Script: `npm run benchmark:manufacturing`
- Fixtures: `benchmark/manufacturing/cases.json`
- Current benchmark asserts:
  - primary domain detection
  - expected role family where relevant
  - score range guardrails
  - matched requirement expectations
  - missing requirement expectations

## Telemetry added
- Product events:
  - `analysis.started`
  - `jd.parse`
  - `cv.parse`
  - `feedback.correction`
- Quality events:
  - `analysis.completed`
  - `analysis.fallback`
  - `jd.lint`
- Summary endpoint:
  - `GET /api/analytics/summary`
