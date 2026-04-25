---
name: pulse-cv-docx-surgical-edit
description: Use when editing, reviewing, or generating CV/resume DOCX files for Pulse CV where recommendations must be inserted without changing the original design, layout, line structure, Hebrew/RTL behavior, or Word styling. Applies to requests mentioning קורות חיים, DOCX, Word export, preserve design, בלי לגעת בעיצוב, or surgical resume edits.
---

# Pulse CV DOCX Surgical Edit

Use this skill for CV/resume edits where format preservation matters.

## Core Rule

Prefer a **DOCX-first surgical patch**. Do not rebuild the whole resume when an original DOCX is available.

If the source is PDF only, be explicit: exact Word design preservation is not possible. PDF conversion can produce an ATS-safe DOCX approximation, but the user should upload the original DOCX for true layout/style retention.

## Workflow

1. Identify source format:
   - DOCX: patch existing paragraphs, tables, headers, and footers.
   - PDF: extract text and regenerate an ATS-safe DOCX; do not claim pixel-perfect preservation.
2. Inspect structure before editing:
   - paragraph count
   - table count
   - major styles
   - header/footer content
   - RTL/mixed Hebrew-English risks
3. Generate a minimal edit plan:
   - change only text needed by evidence-based recommendations
   - do not add unverifiable skills
   - preserve section order and line logic
   - keep contact details unchanged
4. Apply edits surgically:
   - replace target paragraphs only
   - preserve paragraph style and first-run formatting
   - keep paragraph properties such as alignment/list indentation
   - include tables, headers, and footers in search scope
5. Validate:
   - no internal instruction language in final CV
   - contact line still present
   - original section count/style profile did not collapse unexpectedly
   - generated change report describes every edit

## Forbidden

- Do not paste AI coaching notes into the CV.
- Do not invent experience, tools, degrees, or certifications.
- Do not convert a DOCX into plain text and rebuild it unless the source is unrecoverable.
- Do not claim PDF output preserves design exactly.

## Preferred Implementation Notes

- For arbitrary uploaded DOCX files, use `python-docx` for targeted edits and OOXML-aware paragraph property preservation.
- Consider `docx-editor` style hash-anchored paragraph references or tracked changes as a future upgrade.
- Use LLM/Hugging Face only to propose wording; the final evidence and edit plan must remain deterministic and auditable.

## Quick Inspection Script

Run `scripts/inspect_docx.py <file.docx>` to summarize structure before/after edits.
