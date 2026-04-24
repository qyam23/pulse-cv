# Pulse CV Pivot Architecture

## Product
Pulse CV is now positioned as **Evidence-Based Hiring Intelligence** for industrial and manufacturing roles.

## Vertical v1
- manufacturing
- industrial
- process / mechanical / IE
- operations / maintenance adjacent

## Core flow
1. Ingest CV + JD + optional LinkedIn job URL
2. Clean and normalize text
3. Detect domain and role family
4. Extract typed requirements
5. Find CV evidence for each requirement
6. Compute decomposed scores and confidence
7. Draft explanation and rewrite guidance with AI
8. Present grouped results, evidence map, and JD quality warnings

## Source of truth
- typed requirement extraction
- deterministic normalization
- domain pack rules
- evidence engine
- decomposed scoring

## AI usage
AI is used only for:
- profile summary wording
- tailored bio wording
- rewrite suggestions
- interview wording help

AI is not used as the source of truth for:
- final fit decision
- extracted requirements
- evidence existence
- must-have detection
- final score

## Main response blocks
- domainDetection
- jdRequirementsByType
- matchedEvidenceByType
- missingRequirementsByType
- uncertaintyFlags
- scoringBreakdown
- finalScore
- confidenceScore
- jdQualityWarnings
- candidateRecommendations
- recruiterRecommendations
- evidenceMap
- analysisMeta
