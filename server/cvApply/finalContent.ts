import type { CvEditInstruction, CvEditPlan } from "./types";
import { detectTextLanguage, type TextLanguage } from "../analysis/language";
import { sanitizeDisplayText, validateFinalCvSentence } from "./metaLanguageGuard";

export type FinalCvValidationResult = {
  valid: boolean;
  violations: string[];
};

export type SanitizedInstruction = {
  instruction: CvEditInstruction;
  dropped: boolean;
  warnings: string[];
};

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export function sanitizeRecruiterFacingText(value: string): { text: string; warnings: string[]; rejected: boolean } {
  return sanitizeDisplayText(value);
}

export function sanitizeEditInstruction(instruction: CvEditInstruction): SanitizedInstruction {
  const warnings: string[] = [];
  if (!instruction.safeToApply) {
    return {
      instruction,
      dropped: true,
      warnings: [`Dropped instruction ${instruction.id} because it was not marked safeToApply.`],
    };
  }

  const expectedLanguage: TextLanguage = instruction.sourceLanguage === "mixed" || instruction.sourceLanguage === "unknown"
    ? detectTextLanguage(instruction.targetText || instruction.replacementText || "").language
    : instruction.sourceLanguage as TextLanguage;
  const validation = validateFinalCvSentence(instruction.replacementText || "", expectedLanguage);
  if (!validation.safe) {
    return {
      instruction,
      dropped: true,
      warnings: [
        `Dropped instruction ${instruction.id} because replacement text was contaminated.`,
        ...validation.violations.map((entry) => `Violation: ${entry}`),
      ],
    };
  }

  const targetValidation = instruction.targetText
    ? validateFinalCvSentence(instruction.targetText, expectedLanguage)
    : null;

  if (instruction.targetText && targetValidation && !targetValidation.safe) {
    warnings.push(`Target text for ${instruction.id} looks like meta text. Keeping source anchor only.`);
  }

  return {
    instruction: {
      ...instruction,
      targetText: targetValidation?.safe ? instruction.targetText : instruction.targetText,
    },
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
      warnings: unique(warnings),
      instructions,
      sections: plan.sections.map((section) => {
        const sectionInstructions = instructions.filter((item) => item.sectionId === section.id);
        const instructionCount = sectionInstructions.length;
        return instructionCount
          ? {
              ...section,
              status: section.status === "unchanged" ? "will_change" : section.status,
              summary: `${instructionCount} low-risk patch${instructionCount > 1 ? "es" : ""} ready for review`,
            }
          : section;
      }),
    },
    warnings: unique(warnings),
  };
}

export function validateFinalCvOutput(text: string, expectedLanguage: TextLanguage = detectTextLanguage(text).language): FinalCvValidationResult {
  const validation = validateFinalCvSentence(text, expectedLanguage);
  return {
    valid: validation.safe,
    violations: validation.violations,
  };
}
