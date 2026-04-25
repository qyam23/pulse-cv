import crypto from "crypto";
import type { FitAnalysis, RequirementMatch } from "../analysis/types";
import type { CvEditInstruction, CvEditPlan, CvSectionPlanSummary, ResumeSourceDocumentPayload } from "./types";
import { prepareSafeEditPlan, sanitizeRecruiterFacingText } from "./finalContent";

type ResumeSection = {
  id: string;
  label: string;
  lines: string[];
  text: string;
};

const SECTION_HEADINGS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: "Profile", patterns: [/^summary$/i, /^profile$/i, /^about$/i, /^professional summary$/i, /^תקציר$/u, /^פרופיל$/u, /^אודות$/u] },
  { label: "Experience", patterns: [/^experience$/i, /^employment$/i, /^work history$/i, /^ניסיון$/u, /^ניסיון מקצועי$/u, /^תעסוקה$/u] },
  { label: "Skills", patterns: [/^skills$/i, /^core skills$/i, /^technical skills$/i, /^מיומנויות$/u, /^כישורים$/u, /^כלים$/u] },
  { label: "Education", patterns: [/^education$/i, /^academic background$/i, /^השכלה$/u] },
  { label: "Projects", patterns: [/^projects$/i, /^selected projects$/i, /^פרויקטים$/u] },
  { label: "Certifications", patterns: [/^certifications$/i, /^certificates$/i, /^הסמכות$/u, /^תעודות$/u] },
  { label: "Languages", patterns: [/^languages$/i, /^שפות$/u] },
];

function normalizeText(value: string): string {
  return value.replace(/\r/g, "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function stableId(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function detectHeading(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 48) return null;
  for (const heading of SECTION_HEADINGS) {
    if (heading.patterns.some((pattern) => pattern.test(trimmed))) return heading.label;
  }
  return null;
}

function extractSections(resumeText: string): ResumeSection[] {
  const lines = resumeText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [
      {
        id: "section-empty",
        label: "Resume",
        lines: [],
        text: "",
      },
    ];
  }

  const sections: ResumeSection[] = [];
  let current: ResumeSection = {
    id: "section-top",
    label: "Header",
    lines: [],
    text: "",
  };

  const pushCurrent = () => {
    current.text = current.lines.join("\n").trim();
    if (current.text || current.label === "Header") {
      sections.push({ ...current });
    }
  };

  for (const line of lines) {
    const heading = detectHeading(line);
    if (heading) {
      pushCurrent();
      current = {
        id: `section-${stableId(`${heading}-${sections.length}`)}`,
        label: heading,
        lines: [line],
        text: line,
      };
      continue;
    }

    current.lines.push(line);
  }

  pushCurrent();

  return sections.filter((section, index, list) => {
    if (!section.text) return false;
    if (index === 0) return true;
    return section.text !== list[index - 1]?.text;
  });
}

function firstSectionByLabel(sections: ResumeSection[], label: string): ResumeSection | undefined {
  return sections.find((section) => section.label === label);
}

function collectLinkedRequirementIds(matches: RequirementMatch[], limit = 3): string[] {
  return matches
    .slice(0, limit)
    .map((match) => match.requirement.id);
}

function buildSummaryInstruction(
  analysis: FitAnalysis,
  sections: ResumeSection[],
): CvEditInstruction | null {
  if (!analysis.tailoredBio?.trim()) return null;
  const sanitizedBio = sanitizeRecruiterFacingText(analysis.tailoredBio.trim());
  if (sanitizedBio.rejected) return null;
  const summarySection = firstSectionByLabel(sections, "Profile");
  const headerSection = sections[0];
  const weakMatches = Object.values(analysis.missingRequirementsByType)
    .flat()
    .filter((item) => item.state === "weakly_supported" || item.state === "uncertain");

  if (summarySection && summarySection.lines.length >= 2) {
    const targetText = summarySection.lines.slice(1).join("\n").trim();
    if (targetText && normalizeText(targetText) !== normalizeText(sanitizedBio.text)) {
      return {
        id: `instruction-${stableId(`summary-${targetText}`)}`,
        sectionId: summarySection.id,
        sectionLabel: summarySection.label,
        action: "replace_phrase",
        targetText,
        replacementText: sanitizedBio.text,
        rationale: "Tighten the opening summary so it reflects evidence-backed fit and proven manufacturing scope.",
        linkedRequirementIds: collectLinkedRequirementIds(weakMatches, 3),
        confidence: 0.78,
        atsImpact: "high",
        recruiterReadabilityImpact: "high",
      };
    }
  }

  return {
    id: `instruction-${stableId("summary-insert")}`,
    sectionId: headerSection?.id || "section-top",
    sectionLabel: "Profile",
    action: "insert_bullet",
    replacementText: sanitizedBio.text,
    insertionAnchor: headerSection?.lines.slice(-1)[0] || "",
    rationale: "Add a concise evidence-backed profile summary near the top of the CV.",
    linkedRequirementIds: collectLinkedRequirementIds(weakMatches, 3),
    confidence: 0.72,
    atsImpact: "high",
    recruiterReadabilityImpact: "high",
  };
}

function buildBulletInstructions(
  analysis: FitAnalysis,
  sections: ResumeSection[],
  _resumeText: string,
): CvEditInstruction[] {
  const findSourceSection = (target: string) =>
    sections.find((section) => section.lines.some((line) => {
      const normalizedLine = normalizeText(line);
      const normalizedTarget = normalizeText(target);
      return normalizedLine.includes(normalizedTarget) || normalizedTarget.includes(normalizedLine);
    }));
  const weakMatches = Object.values(analysis.matchedEvidenceByType)
    .flat()
    .concat(Object.values(analysis.missingRequirementsByType).flat());

  return analysis.bulletPointOptimization
    .filter((item) => item.original && !/^No direct proof/i.test(item.original))
    .filter((item) => normalizeText(item.original).length > 8)
    .map((item) => ({ item, sourceSection: findSourceSection(item.original) }))
    .filter(({ sourceSection }) => Boolean(sourceSection))
    .filter(({ sourceSection }) => sourceSection?.label !== "Profile")
    .map(({ item, sourceSection }) => {
      const sanitized = sanitizeRecruiterFacingText(item.optimized.trim());
      return sanitized.rejected
        ? null
        : { item: { ...item, optimized: sanitized.text }, sourceSection };
    })
    .filter((item): item is { item: { original: string; optimized: string; rationale: string }; sourceSection: ResumeSection } => Boolean(item))
    .slice(0, 3)
    .map(({ item, sourceSection }, index) => ({
      id: `instruction-${stableId(`bullet-${item.original}-${item.optimized}-${index}`)}`,
      sectionId: sourceSection?.id || "section-experience",
      sectionLabel: sourceSection?.label || "Experience",
      action: "rewrite_bullet" as const,
      targetText: item.original.trim(),
      replacementText: item.optimized.trim(),
      rationale: item.rationale,
      linkedRequirementIds: collectLinkedRequirementIds(
        weakMatches.filter((match) => item.rationale.includes(match.requirement.label) || item.optimized.includes(match.requirement.label)),
        3,
      ),
      confidence: 0.75,
      atsImpact: "medium" as const,
      recruiterReadabilityImpact: "high" as const,
    }));
}

function buildSkillsInstruction(analysis: FitAnalysis, sections: ResumeSection[], resumeText: string): CvEditInstruction | null {
  const skillsSection = firstSectionByLabel(sections, "Skills");
  if (!skillsSection) return null;

  const strongEvidence = analysis.evidenceMap
    .filter((row) => row.matchState === "matched" || row.matchState === "partially_matched")
    .filter((row) => row.category === "Tools / Systems" || row.category === "Hard Skills" || row.category === "Manufacturing / Domain")
    .map((row) => row.requirement)
    .filter((value, index, array) => array.indexOf(value) === index)
    .filter((label) => !normalizeText(skillsSection.text).includes(normalizeText(label)))
    .slice(0, 4);

  if (!strongEvidence.length) return null;

  return {
    id: `instruction-${stableId(`skills-${strongEvidence.join("|")}`)}`,
    sectionId: skillsSection.id,
    sectionLabel: skillsSection.label,
    action: "insert_bullet",
    replacementText: strongEvidence.join(" | "),
    insertionAnchor: skillsSection.lines.slice(-1)[0] || skillsSection.lines[0],
    rationale: "Make already-proven tools and manufacturing methods more explicit in the skills section without inventing new claims.",
    linkedRequirementIds: analysis.evidenceMap
      .filter((row) => strongEvidence.includes(row.requirement))
      .slice(0, 4)
      .map((row) => row.requirementId),
    confidence: 0.7,
    atsImpact: "medium",
    recruiterReadabilityImpact: "medium",
  };
}

export function buildCvEditPlan(
  analysis: FitAnalysis,
  resumeText: string,
  sourceDocument: ResumeSourceDocumentPayload,
): CvEditPlan {
  const sections = extractSections(resumeText);
  const instructions: CvEditInstruction[] = [];

  const summaryInstruction = buildSummaryInstruction(analysis, sections);
  if (summaryInstruction) instructions.push(summaryInstruction);

  instructions.push(...buildBulletInstructions(analysis, sections, resumeText));

  const skillsInstruction = buildSkillsInstruction(analysis, sections, resumeText);
  if (skillsInstruction) instructions.push(skillsInstruction);

  const touchedIds = new Set(instructions.map((instruction) => instruction.sectionId));
  const sectionSummaries: CvSectionPlanSummary[] = sections.map((section) => ({
    id: section.id,
    label: section.label,
    status: touchedIds.has(section.id) ? "will_change" : "unchanged",
    summary: touchedIds.has(section.id)
      ? `${instructions.filter((instruction) => instruction.sectionId === section.id).length} targeted edit${instructions.filter((instruction) => instruction.sectionId === section.id).length > 1 ? "s" : ""}`
      : "No edits planned for this section.",
  }));

  if (summaryInstruction && !sections.some((section) => section.id === summaryInstruction.sectionId)) {
    sectionSummaries.unshift({
      id: summaryInstruction.sectionId,
      label: summaryInstruction.sectionLabel,
      status: "new_content",
      summary: "A new recruiter-ready summary will be inserted near the top of the CV.",
    });
  }

  const warnings: string[] = [];
  if (sourceDocument.format === "pdf") {
    warnings.push("PDF output uses a recruiter-safe DOCX regeneration path. Exact Word layout preservation requires uploading the original DOCX file.");
    warnings.push("If the source was a PDF, the exported Word file prioritizes ATS readability, content order, and writing style over pixel-perfect visual design.");
  }
  if (!instructions.length) {
    warnings.push("No safe surgical edits were generated from the current analysis. The source CV will remain unchanged.");
  }

  const rawPlan: CvEditPlan = {
    planId: `plan-${stableId(`${sourceDocument.fileName}-${analysis.analysisMeta.inputHash}`)}`,
    sourceFileName: sourceDocument.fileName,
    sourceFormat: sourceDocument.format,
    strategy: sourceDocument.format === "docx" ? "docx_surgical" : "pdf_recruiter_safe",
    warnings,
    sections: sectionSummaries,
    instructions,
    untouchedSections: sectionSummaries.filter((section) => section.status === "unchanged").map((section) => section.label),
  };
  return prepareSafeEditPlan(rawPlan).plan;
}
