---
title: Pulse CV
emoji: "📄"
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# Pulse CV

Pulse CV is now positioned as **Evidence-Based Hiring Intelligence** for industrial and manufacturing hiring.

## Product promise
- See what the job description truly asks for
- See what the CV truly proves
- Understand what is matched, missing, weak, or uncertain
- Review fit with evidence, confidence, and JD quality warnings

## v1 vertical
- manufacturing
- industrial
- process / mechanical / IE
- operations / maintenance adjacent

## Runtime
- Public app: Hugging Face Space
- Static mirror: GitHub Pages
- Local development: Vite + Express server in `server.ts`

## Key APIs
- `POST /api/analyze`
- `POST /api/jd/parse`
- `POST /api/cv/parse`
- `POST /api/jd/lint`
- `GET /api/analytics/summary`
- `POST /api/feedback/correction`
- `POST /api/scrape`
- `GET /health`

## Source of truth
The fit model is deterministic and evidence-based.

AI is used only for:
- explanation
- narrative summary
- rewrite guidance
- interview wording support

AI is not the source of truth for:
- extracted requirements
- evidence existence
- final score
- must-have logic

## Local run
```bash
npm install
npm run dev
```

Then open:
- `http://localhost:3000`

## Build
```bash
npm run build
```

## Validation
```bash
npm run lint
npm run benchmark:manufacturing
```

## Domain pack v1
This release includes a first `manufacturing_pack` with:
- titles
- tools
- methods
- domain concepts
- leadership signals
- weighting rules
- false-positive guards

## Benchmark scaffolding
- Fixtures: [benchmark/manufacturing/cases.json](C:\Users\user\Documents\Playground\pulse-cv\benchmark\manufacturing\cases.json)
- Runner: [scripts/run-manufacturing-benchmark.ts](C:\Users\user\Documents\Playground\pulse-cv\scripts\run-manufacturing-benchmark.ts)
- Current benchmark coverage:
  - domain detection
  - score range guardrails
  - matched vs missing requirement expectations

## Docs
- [Product audit](./docs/product-audit.md)
- [Pivot architecture](./docs/pivot-architecture.md)
- [Validation report](./docs/validation-report.md)
