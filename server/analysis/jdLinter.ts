import type { JDQualityWarning, Requirement } from "./types";
import { normalizeText } from "./normalization";

const VAGUE_PATTERNS = [
  /excellent communication/i,
  /dynamic environment/i,
  /high level/i,
  /strong personality/i,
  /יחסי אנוש/i,
  /יכולת גבוהה/i,
  /מחפשת אחר/i
];

export function lintJobDescription(jobDescription: string, requirements: Requirement[]): JDQualityWarning[] {
  const warnings: JDQualityWarning[] = [];
  const normalized = normalizeText(jobDescription);

  const mustHaveRequirements = requirements.filter((item) => item.mustHave);
  const mustHaveCount = mustHaveRequirements.length;
  const mustHaveRatio = requirements.length ? mustHaveCount / requirements.length : 0;
  const mustHaveCategories = new Set(mustHaveRequirements.map((item) => item.type));
  if (mustHaveCount >= 8 || (mustHaveCount >= 6 && mustHaveRatio >= 0.6) || mustHaveCategories.size >= 5) {
    warnings.push({
      id: "must-have-inflation",
      severity: "warning",
      title: "Must-have inflation",
      message: "The JD marks a broad share of requirements as mandatory across multiple categories. This may hide strong candidates behind an over-constrained screen.",
      affectedRequirementIds: mustHaveRequirements.map((item) => item.id)
    });
  }

  if (requirements.some((item) => item.type === "leadership_responsibility") &&
      requirements.some((item) => item.type === "manufacturing_domain") &&
      /(hands[- ]on|בשטח|hands on)/i.test(jobDescription)) {
    warnings.push({
      id: "mixed-scope",
      severity: "warning",
      title: "Mixed leadership and hands-on scope",
      message: "This JD mixes operational leadership with hands-on execution. Consider clarifying whether the role is a manager, lead IC, or hybrid.",
      affectedRequirementIds: requirements
        .filter((item) => item.type === "leadership_responsibility" || item.type === "role_title")
        .map((item) => item.id)
    });
  }

  if (VAGUE_PATTERNS.some((pattern) => pattern.test(jobDescription))) {
    warnings.push({
      id: "vague-language",
      severity: "info",
      title: "Vague evaluative language",
      message: "Some JD phrases are hard to evaluate consistently. Clearer skills, tools, and scope statements would improve recruiter-grade matching.",
      affectedRequirementIds: []
    });
  }

  const duplicateKeys = new Map<string, number>();
  for (const requirement of requirements) {
    const key = `${requirement.type}:${normalizeText(requirement.normalizedValue)}`;
    duplicateKeys.set(key, (duplicateKeys.get(key) || 0) + 1);
  }
  const duplicateRequirementIds = requirements
    .filter((requirement) => (duplicateKeys.get(`${requirement.type}:${normalizeText(requirement.normalizedValue)}`) || 0) > 1)
    .map((requirement) => requirement.id);
  if (duplicateRequirementIds.length) {
    warnings.push({
      id: "duplicate-requirements",
      severity: "info",
      title: "Duplicate requirement language",
      message: "Some requirements appear multiple times with similar wording. Consolidating them would make the JD clearer and easier to evaluate.",
      affectedRequirementIds: duplicateRequirementIds
    });
  }

  if (/all[- ]in[- ]one|everything from|כולל הכל/i.test(normalized)) {
    warnings.push({
      id: "scope-overload",
      severity: "high_risk",
      title: "Possible scope overload",
      message: "The JD suggests a very broad scope across multiple responsibility zones. This can create false mismatches and unclear hiring calibration.",
      affectedRequirementIds: requirements.map((requirement) => requirement.id)
    });
  }

  return warnings;
}
