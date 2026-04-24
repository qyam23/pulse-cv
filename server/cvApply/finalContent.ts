import type { CvEditInstruction, CvEditPlan } from "./types";

const BANNED_PHRASE_PATTERNS: RegExp[] = [
  /\bif accurate\b/i,
  /\badd a bullet\b/i,
  /\bsuggested\b/i,
  /\brecommendation\b/i,
  /\bevidence-backed\b/i,
  /\bconsider adding\b/i,
  /\bif relevant\b/i,
  /\bif applicable\b/i,
  /\bimprove proof of\b/i,
  /\btailor this\b/i,
  /\bthe cv should\b/i,
  /\bthe candidate should\b/i,
  /\bedit plan\b/i,
  /\bplanner\b/i,
  /\bcoaching\b/i,
  /\banalysis\b/i,
  /\bapply recommendations?\b/i,
  /\brecruiter-ready\b/i,
  /\bwording layer\b/i,
  /\binternal explanation\b/i,
];

const BANNED_LINE_PATTERNS: RegExp[] = [
  /^if\b/i,
  /^suggested\b/i,
  /^recommendation\b/i,
  /^consider\b/i,
  /^tailor\b/i,
  /^the cv should\b/i,
  /^the candidate should\b/i,
];

export type FinalCvValidationResult = {
  valid: boolean;
  violations: string[];
};

export type SanitizedInstruction = {
  instruction: CvEditInstruction;
  dropped: boolean;
  warnings: string[];
};

function cleanWhitespace(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeRecruiterFacingText(value: string): { text: string; warnings: string[]; rejected: boolean } {
  const warnings: string[] = [];
  if (!value?.trim()) {
    return { text: "", warnings, rejected: true };
  }

  const keptLines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const banned = BANNED_LINE_PATTERNS.some((pattern) => pattern.test(line)) || BANNED_PHRASE_PATTERNS.some((pattern) => pattern.test(line));
      if (banned) {
        warnings.push(`Removed internal instruction line: ${line}`);
      }
      return !banned;
    });

  const text = cleanWhitespace(keptLines.join("\n"));
  const rejected = !text || BANNED_PHRASE_PATTERNS.some((pattern) => pattern.test(text));
  if (rejected) {
    warnings.push("Recruiter-facing text was rejected because it still contained internal instruction language.");
  }
  return { text, warnings, rejected };
}

export function sanitizeEditInstruction(instruction: CvEditInstruction): SanitizedInstruction {
  const warnings: string[] = [];
  const cleanedReplacement = instruction.replacementText
    ? sanitizeRecruiterFacingText(instruction.replacementText)
    : { text: "", warnings: [], rejected: false };
  warnings.push(...cleanedReplacement.warnings);

  if (instruction.replacementText && cleanedReplacement.rejected) {
    return {
      instruction,
      dropped: true,
      warnings: [`Dropped instruction ${instruction.id} because replacement text was contaminated.`, ...warnings],
    };
  }

  const cleanedTarget = instruction.targetText
    ? sanitizeRecruiterFacingText(instruction.targetText)
    : { text: "", warnings: [], rejected: false };

  const sanitizedInstruction: CvEditInstruction = {
    ...instruction,
    replacementText: instruction.replacementText ? cleanedReplacement.text : instruction.replacementText,
    targetText: instruction.targetText && !cleanedTarget.rejected ? cleanedTarget.text : instruction.targetText,
  };

  return {
    instruction: sanitizedInstruction,
    dropped: false,
    warnings,
  };
}

export function prepareSafeEditPlan(plan: CvEditPlan): { plan: CvEditPlan; warnings: string[] } {
  const warnings = [...plan.warnings];
  const instructions: CvEditInstruction[] = [];

  for (const instruction of plan.instructions) {
    const sanitized = sanitizeEditInstruction(instruction);
    warnings.push(...sanitized.warnings);
    if (!sanitized.dropped) {
      instructions.push(sanitized.instruction);
    }
  }

  return {
    plan: {
      ...plan,
      warnings: Array.from(new Set(warnings)),
      instructions,
      sections: plan.sections.map((section) => {
        const instructionCount = instructions.filter((item) => item.sectionId === section.id).length;
        return instructionCount
          ? {
              ...section,
              status: section.status === "unchanged" ? "will_change" : section.status,
              summary: `${instructionCount} targeted edit${instructionCount > 1 ? "s" : ""}`,
            }
          : section;
      }),
    },
    warnings: Array.from(new Set(warnings)),
  };
}

export function validateFinalCvOutput(text: string): FinalCvValidationResult {
  const normalized = cleanWhitespace(text);
  const violations = BANNED_PHRASE_PATTERNS.filter((pattern) => pattern.test(normalized)).map((pattern) => pattern.source);
  return {
    valid: violations.length === 0,
    violations,
  };
}

