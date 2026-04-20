# PulseCV Intelligence Assets

These assets are deterministic prompt-enrichment resources. They do not score candidates directly and do not replace the LLM-based output contract.

- `assets/v1/*.json` contains manually seeded normalization, section, seniority, requirement, impact, and role-profile patterns.
- `promptEnricher.ts` reads these assets and produces structured pre-analysis for the backend prompt.
- Dataset audit scripts are evaluation-only and do not import public datasets into runtime.
