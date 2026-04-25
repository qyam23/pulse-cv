import crypto from "crypto";
import { manufacturingPack } from "../domain/manufacturingPack";
import {
  includesAlias,
  lineSpans,
  normalizeText,
  overlapRatio,
  sentenceSpans,
  slugify,
  tokenize,
  unique,
} from "./normalization";
import { lintJobDescription } from "./jdLinter";
import type {
  AnalysisMeta,
  CandidateRecommendations,
  DomainDetection,
  Evidence,
  EvidenceMapRow,
  FitAnalysis,
  JDQualityWarning,
  MatchState,
  RecruiterRecommendations,
  Requirement,
  RequirementMatch,
  RequirementType,
  ScoringBreakdown,
  SupportLevel,
} from "./types";

const GENERIC_TOKENS = new Set([
  "required", "minimum", "least", "looking", "seeking", "company", "position", "must", "plus", "high", "strong", "individual_contributor", "role_scope",
  "לפחות", "נדרשת", "מחפשת", "מובילה", "יצרנית", "מרכזיים", "נרחב", "חובה", "ברמה", "כמהנדס", "הבנה"
]);

const MUST_HAVE_PATTERNS = [
  /\bmust\b/i,
  /\brequired\b/i,
  /\bmandatory\b/i,
  /\bminimum\b/i,
  /חובה/u,
  /נדרש/u,
  /נדרשת/u,
  /ניסיון של/u
];

const NICE_TO_HAVE_PATTERNS = [/\bpreferred\b/i, /\badvantage\b/i, /\bnice to have\b/i, /יתרון/u];
const LEADERSHIP_SCOPE_PATTERNS = /lead|head|manager|director|management|מנהל|הובלה|סמנכ/iu;
const YEARS_PATTERNS = /\d+\s*(years|year|שנים|שנה)/i;
const REQUIRED_CONTEXT_PATTERNS = /must|required|mandatory|minimum|experience with|knowledge of|hands[- ]on|חובה|נדרש|נדרשת|ידע ב|ידע וניסיון|ניסיון ב|ניסיון עם/u;

function stableHash(...parts: string[]): string {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

function requirementTypeLabel(type: RequirementType): string {
  switch (type) {
    case "role_title":
      return "Role";
    case "seniority":
      return "Seniority";
    case "education_background":
    case "degree":
      return "Education";
    case "hard_skill":
    case "methodology":
      return "Hard Skills";
    case "tool_system":
      return "Tools / Systems";
    case "leadership_responsibility":
      return "Leadership";
    case "manufacturing_domain":
    case "industry_context":
      return "Manufacturing / Domain";
    case "must_have_requirement":
      return "Must-Haves";
    case "language_requirement":
      return "Language";
    case "years_experience":
      return "Experience";
    default:
      return "Other";
  }
}

export function detectDomain(jobDescription: string): DomainDetection {
  const text = normalizeText(jobDescription);
  const titleHits = manufacturingPack.titlesCatalog.filter((entry) => entry.aliases.some((alias) => includesAlias(text, alias)));
  const toolHits = manufacturingPack.toolsCatalog.filter((entry) => entry.aliases.some((alias) => includesAlias(text, alias)));
  const domainHits = manufacturingPack.domainConcepts.filter((entry) => entry.aliases.some((alias) => includesAlias(text, alias)));
  const leadershipHits = manufacturingPack.leadershipSignals.filter((entry) => entry.aliases.some((alias) => includesAlias(text, alias)));

  const primaryDomain = domainHits.length ? "manufacturing" : "industrial";
  const secondaryDomain = leadershipHits.length ? "operations" : domainHits.find((entry) => entry.canonical !== "Manufacturing")?.canonical || null;
  const roleFamily = titleHits[0]?.roleFamily || (leadershipHits.length ? "engineering_leadership" : "manufacturing_engineering");
  const seniority =
    titleHits.find((entry) => entry.seniorityHint)?.seniorityHint ||
    (titleHits.some((entry) => /manager|head|director|leadership/i.test(entry.roleFamily || "")) ? "leadership" : "individual_contributor");
  const signalCount = titleHits.length + toolHits.length + domainHits.length + leadershipHits.length;

  return {
    primaryDomain,
    secondaryDomain,
    roleFamily,
    seniority,
    confidence: Math.max(0.58, Math.min(0.96, 0.58 + signalCount * 0.05)),
    signals: unique([
      ...titleHits.map((entry) => entry.canonical),
      ...toolHits.map((entry) => entry.canonical),
      ...domainHits.map((entry) => entry.canonical),
      ...leadershipHits.map((entry) => entry.canonical)
    ]).slice(0, 12)
  };
}

function lineImportance(line: string, mustHave: boolean): number {
  const base = mustHave ? 0.88 : 0.62;
  if (/lead|head|manager|director|מנהל|הובלה|מחלקת/u.test(line)) return Math.min(1, base + 0.08);
  if (/safety|quality|בטיחות|איכות/i.test(line)) return Math.min(1, base + 0.05);
  return base;
}

function strengthForLine(line: string, mustHave: boolean): number {
  let strength = mustHave ? 0.86 : 0.58;
  if (/must|required|mandatory|minimum|חובה|נדרש|נדרשת/u.test(line)) strength += 0.08;
  if (YEARS_PATTERNS.test(line)) strength += 0.05;
  return Math.min(1, strength);
}

function shouldEmitSeniorityRequirement(domain: DomainDetection, titleText: string, jobDescription: string): boolean {
  if (domain.seniority === "leadership") return true;
  return /senior|principal|staff|lead engineer|בכיר|בכירה/u.test(`${titleText} ${jobDescription}`);
}

function resolveRequirementMustHave(
  type: RequirementType,
  line: string,
  mustHaveHint: boolean,
  niceToHaveHint: boolean,
  domain: DomainDetection
): boolean {
  if (type === "role_title" || type === "years_experience") return true;
  if (niceToHaveHint && !mustHaveHint) return false;

  const leadershipScope = LEADERSHIP_SCOPE_PATTERNS.test(line);
  const hasRequiredContext = REQUIRED_CONTEXT_PATTERNS.test(line);

  switch (type) {
    case "seniority":
      return domain.seniority === "leadership" && leadershipScope;
    case "education_background":
    case "degree":
    case "tool_system":
    case "language_requirement":
      return mustHaveHint || hasRequiredContext;
    case "leadership_responsibility":
      return (mustHaveHint || hasRequiredContext) && leadershipScope;
    case "manufacturing_domain":
    case "methodology":
    case "hard_skill":
    case "industry_context":
      return mustHaveHint && hasRequiredContext;
    default:
      return mustHaveHint;
  }
}

function resolveRequirementConfidence(line: string, mustHave: boolean, niceToHave: boolean): number {
  if (mustHave) return 0.9;
  if (niceToHave) return 0.66;
  if (YEARS_PATTERNS.test(line)) return 0.84;
  if (REQUIRED_CONTEXT_PATTERNS.test(line)) return 0.8;
  return 0.74;
}

function addRequirement(
  requirements: Requirement[],
  {
    label,
    normalizedValue,
    type,
    subtype,
    sourceText,
    sourceSpanStart,
    sourceSpanEnd,
    mustHave,
    confidence,
    senioritySignal,
    domain
  }: Omit<Requirement, "id" | "importance" | "requirementStrength">
) {
  const key = `${type}:${normalizeText(normalizedValue)}`;
  if (requirements.some((item) => `${item.type}:${normalizeText(item.normalizedValue)}` === key)) {
    return;
  }
  requirements.push({
    id: slugify(`${type}-${normalizedValue}-${sourceSpanStart}`),
    label,
    normalizedValue,
    type,
    subtype,
    sourceText,
    sourceSpanStart,
    sourceSpanEnd,
    domain,
    importance: lineImportance(sourceText, mustHave),
    requirementStrength: strengthForLine(sourceText, mustHave),
    senioritySignal,
    mustHave,
    confidence
  });
}

export function extractRequirements(jobDescription: string, domain: DomainDetection): Requirement[] {
  const requirements: Requirement[] = [];
  const spans = lineSpans(jobDescription);
  const titleLine = spans.find((span) =>
    manufacturingPack.titlesCatalog.some((entry) => entry.aliases.some((alias) => includesAlias(span.text, alias)))
  ) || spans[0];

  if (titleLine) {
    const matchingTitle = manufacturingPack.titlesCatalog.find((entry) => entry.aliases.some((alias) => includesAlias(titleLine.text, alias)));
    addRequirement(requirements, {
      label: matchingTitle?.canonical || titleLine.text,
      normalizedValue: matchingTitle?.canonical || titleLine.text,
      type: "role_title",
      subtype: domain.roleFamily,
      sourceText: titleLine.text,
      sourceSpanStart: titleLine.start,
      sourceSpanEnd: titleLine.end,
      mustHave: true,
      confidence: matchingTitle ? 0.93 : 0.68,
      senioritySignal: domain.seniority,
      domain: domain.primaryDomain
    });
  }

  if (shouldEmitSeniorityRequirement(domain, titleLine?.text || "", jobDescription)) {
    addRequirement(requirements, {
      label: domain.seniority,
      normalizedValue: domain.seniority,
      type: "seniority",
      subtype: "role_scope",
      sourceText: titleLine?.text || jobDescription.slice(0, 80),
      sourceSpanStart: titleLine?.start || 0,
      sourceSpanEnd: titleLine?.end || Math.min(80, jobDescription.length),
      mustHave: true,
      confidence: domain.confidence,
      senioritySignal: domain.seniority,
      domain: domain.primaryDomain
    });
  }

  for (const span of spans) {
    const mustHaveHint = MUST_HAVE_PATTERNS.some((pattern) => pattern.test(span.text));
    const niceToHaveHint = NICE_TO_HAVE_PATTERNS.some((pattern) => pattern.test(span.text));

    for (const entry of manufacturingPack.educationCatalog) {
      if (entry.aliases.some((alias) => includesAlias(span.text, alias))) {
        const mustHave = resolveRequirementMustHave("education_background", span.text, mustHaveHint, niceToHaveHint, domain);
        addRequirement(requirements, {
          label: entry.canonical,
          normalizedValue: entry.canonical,
          type: "education_background",
          subtype: entry.subtype || "degree",
          sourceText: span.text,
          sourceSpanStart: span.start,
          sourceSpanEnd: span.end,
          mustHave,
          confidence: resolveRequirementConfidence(span.text, mustHave, niceToHaveHint),
          senioritySignal: null,
          domain: domain.primaryDomain
        });
      }
    }

    for (const entry of manufacturingPack.toolsCatalog) {
      if (entry.aliases.some((alias) => includesAlias(span.text, alias))) {
        const mustHave = resolveRequirementMustHave("tool_system", span.text, mustHaveHint, niceToHaveHint, domain);
        addRequirement(requirements, {
          label: entry.canonical,
          normalizedValue: entry.canonical,
          type: "tool_system",
          subtype: entry.subtype || "tool",
          sourceText: span.text,
          sourceSpanStart: span.start,
          sourceSpanEnd: span.end,
          mustHave,
          confidence: resolveRequirementConfidence(span.text, mustHave, niceToHaveHint),
          senioritySignal: null,
          domain: domain.primaryDomain
        });
      }
    }

    for (const entry of manufacturingPack.methodsCatalog) {
      if (entry.aliases.some((alias) => includesAlias(span.text, alias))) {
        const mustHave = resolveRequirementMustHave("methodology", span.text, mustHaveHint, niceToHaveHint, domain);
        addRequirement(requirements, {
          label: entry.canonical,
          normalizedValue: entry.canonical,
          type: "methodology",
          subtype: entry.subtype || "method",
          sourceText: span.text,
          sourceSpanStart: span.start,
          sourceSpanEnd: span.end,
          mustHave,
          confidence: resolveRequirementConfidence(span.text, mustHave, niceToHaveHint),
          senioritySignal: null,
          domain: domain.primaryDomain
        });
      }
    }

    for (const entry of manufacturingPack.domainConcepts) {
      if (entry.aliases.some((alias) => includesAlias(span.text, alias))) {
        const mustHave = resolveRequirementMustHave("manufacturing_domain", span.text, mustHaveHint, niceToHaveHint, domain);
        addRequirement(requirements, {
          label: entry.canonical,
          normalizedValue: entry.canonical,
          type: "manufacturing_domain",
          subtype: entry.subtype || "domain",
          sourceText: span.text,
          sourceSpanStart: span.start,
          sourceSpanEnd: span.end,
          mustHave,
          confidence: resolveRequirementConfidence(span.text, mustHave, niceToHaveHint),
          senioritySignal: null,
          domain: domain.primaryDomain
        });
      }
    }

    for (const entry of manufacturingPack.leadershipSignals) {
      if (entry.aliases.some((alias) => includesAlias(span.text, alias))) {
        const mustHave = resolveRequirementMustHave("leadership_responsibility", span.text, mustHaveHint, niceToHaveHint, domain);
        addRequirement(requirements, {
          label: entry.canonical,
          normalizedValue: entry.canonical,
          type: "leadership_responsibility",
          subtype: entry.subtype || "leadership",
          sourceText: span.text,
          sourceSpanStart: span.start,
          sourceSpanEnd: span.end,
          mustHave,
          confidence: resolveRequirementConfidence(span.text, mustHave, niceToHaveHint),
          senioritySignal: domain.seniority,
          domain: domain.primaryDomain
        });
      }
    }

    for (const entry of manufacturingPack.languageCatalog) {
      if (entry.aliases.some((alias) => includesAlias(span.text, alias))) {
        const mustHave = resolveRequirementMustHave("language_requirement", span.text, mustHaveHint, niceToHaveHint, domain);
        addRequirement(requirements, {
          label: entry.canonical,
          normalizedValue: entry.canonical,
          type: "language_requirement",
          subtype: "language",
          sourceText: span.text,
          sourceSpanStart: span.start,
          sourceSpanEnd: span.end,
          mustHave,
          confidence: resolveRequirementConfidence(span.text, mustHave, niceToHaveHint),
          senioritySignal: null,
          domain: domain.primaryDomain
        });
      }
    }

    const yearsMatch = span.text.match(/(\d+)\s*(years|year|שנים|שנה)/i);
    if (yearsMatch) {
      addRequirement(requirements, {
        label: `${yearsMatch[1]} years experience`,
        normalizedValue: yearsMatch[1],
        type: "years_experience",
        subtype: "experience",
        sourceText: span.text,
        sourceSpanStart: span.start,
        sourceSpanEnd: span.end,
        mustHave: true,
        confidence: 0.94,
        senioritySignal: null,
        domain: domain.primaryDomain
      });
    }
  }

  return requirements;
}

function aliasUniverse(requirement: Requirement): string[] {
  const collections = [
    ...manufacturingPack.titlesCatalog,
    ...manufacturingPack.toolsCatalog,
    ...manufacturingPack.methodsCatalog,
    ...manufacturingPack.domainConcepts,
    ...manufacturingPack.leadershipSignals,
    ...manufacturingPack.educationCatalog,
    ...manufacturingPack.languageCatalog
  ];
  const matched = collections.find((entry) => entry.canonical === requirement.normalizedValue || entry.canonical === requirement.label);
  return unique([requirement.label, requirement.normalizedValue, ...(matched?.aliases || [])]).filter(Boolean);
}

function scoreSupportLevel(level: SupportLevel): number {
  switch (level) {
    case "explicit":
      return 1;
    case "strong_partial":
      return 0.75;
    case "weak_partial":
      return 0.45;
    case "implied":
      return 0.3;
    case "unclear":
      return 0.18;
    default:
      return 0;
  }
}

function findEvidenceForRequirement(resumeText: string, requirement: Requirement): Evidence[] {
  const spans = sentenceSpans(resumeText);
  const aliases = aliasUniverse(requirement);
  const evidences: Evidence[] = [];

  for (const span of spans) {
    const normalizedSpan = normalizeText(span.text);
    const exactAlias = aliases.find((alias) => includesAlias(normalizedSpan, alias));
    const overlap = Math.max(...aliases.map((alias) => overlapRatio(span.text, alias)), 0);
    const quantifiedImpactPresent = /\b\d+[%x]?\b/.test(span.text) || /(reduced|improved|increase|improvement|הפחתה|שיפור|חסכון|ייעול)/i.test(span.text);
    const yearsMatch = span.text.match(/(\d+)\s*(years|year|שנים|שנה)/i);

    let supportLevel: SupportLevel = "missing";
    let evidenceType: Evidence["evidenceType"] = "semantic_equivalent";
    let rationale = "";

    if (exactAlias) {
      supportLevel = "explicit";
      evidenceType =
        requirement.type === "tool_system"
          ? "tool_usage"
          : requirement.type === "education_background"
            ? "education_signal"
            : requirement.type === "role_title"
              ? "title_signal"
              : "exact_term";
      rationale = `The CV explicitly mentions ${exactAlias}.`;
    } else if (overlap >= 0.7) {
      supportLevel = "strong_partial";
      evidenceType = requirement.type === "leadership_responsibility" ? "responsibility_evidence" : "normalized_alias";
      rationale = "The CV uses closely related wording that strongly supports this requirement.";
    } else if (overlap >= 0.45) {
      supportLevel = "weak_partial";
      evidenceType = requirement.type === "manufacturing_domain" ? "domain_context" : "semantic_equivalent";
      rationale = "The CV suggests adjacent evidence, but not a clean direct proof.";
    } else if (
      requirement.type === "leadership_responsibility" &&
      /(ניהול|lead|manager|supervis|operators|technicians|engineers)/i.test(span.text)
    ) {
      supportLevel = "implied";
      evidenceType = "responsibility_evidence";
      rationale = "The CV implies leadership scope, but without a precise manufacturing leadership proof.";
    } else if (
      requirement.type === "manufacturing_domain" &&
      /(manufacturing|production|factory|plant|ייצור|מפעל|תהליכי ייצור|תעשייתי)/i.test(span.text)
    ) {
      supportLevel = "implied";
      evidenceType = "domain_context";
      rationale = "The CV shows relevant manufacturing context, but not the exact JD wording.";
    }

    if (supportLevel !== "missing") {
      evidences.push({
        requirementId: requirement.id,
        supportLevel,
        confidence: Math.min(0.98, 0.44 + scoreSupportLevel(supportLevel) * 0.5 + (quantifiedImpactPresent ? 0.06 : 0)),
        cvSourceText: span.text,
        cvSpanStart: span.start,
        cvSpanEnd: span.end,
        evidenceType,
        rationale,
        matchedAlias: exactAlias || null,
        recencySignal: span.start < resumeText.length * 0.45 ? "recent_or_prominent" : null,
        strengthSignal: quantifiedImpactPresent ? "quantified_impact" : null,
        yearsInferred: yearsMatch ? Number(yearsMatch[1]) : null,
        quantifiedImpactPresent,
        ambiguityFlag: supportLevel === "weak_partial" || supportLevel === "implied"
      });
    }
  }

  if (!evidences.length) {
    return [{
      requirementId: requirement.id,
      supportLevel: "missing",
      confidence: 0.82,
      cvSourceText: "",
      cvSpanStart: -1,
      cvSpanEnd: -1,
      evidenceType: "semantic_equivalent",
      rationale: "No direct CV evidence was found for this requirement.",
      matchedAlias: null,
      recencySignal: null,
      strengthSignal: null,
      yearsInferred: null,
      quantifiedImpactPresent: false,
      ambiguityFlag: false
    }];
  }

  return evidences.sort((left, right) => scoreSupportLevel(right.supportLevel) - scoreSupportLevel(left.supportLevel) || right.confidence - left.confidence);
}

function stateFromEvidence(requirement: Requirement, evidence: Evidence[]): MatchState {
  const top = evidence[0];
  if (!top || top.supportLevel === "missing") return "missing";
  if (top.supportLevel === "explicit") return "matched";
  if (top.supportLevel === "strong_partial") return "partially_matched";
  if (top.supportLevel === "weak_partial") return "weakly_supported";
  if (requirement.mustHave) return "uncertain";
  return "weakly_supported";
}

function rationaleForMatch(match: RequirementMatch): string {
  if (!match.topEvidence || match.topEvidence.supportLevel === "missing") {
    return `No CV evidence was found for ${match.requirement.label}.`;
  }
  return match.topEvidence.rationale;
}

export function buildMatches(resumeText: string, requirements: Requirement[]): RequirementMatch[] {
  return requirements.map((requirement) => {
    const evidence = findEvidenceForRequirement(resumeText, requirement);
    const topEvidence = evidence[0] || null;
    const state = stateFromEvidence(requirement, evidence);
    return {
      requirement,
      evidence,
      state,
      topEvidence,
      confidence: topEvidence?.confidence || 0.25,
      rationale: rationaleForMatch({
        requirement,
        evidence,
        topEvidence,
        state,
        confidence: topEvidence?.confidence || 0.25,
        rationale: ""
      })
    };
  });
}

function categoryScore(matches: RequirementMatch[], types: RequirementType[]): number {
  const filtered = matches.filter((match) => types.includes(match.requirement.type));
  if (!filtered.length) return 70;
  const totalWeight = filtered.reduce((sum, match) => sum + match.requirement.importance, 0);
  const earned = filtered.reduce((sum, match) => sum + match.requirement.importance * scoreSupportLevel(match.topEvidence?.supportLevel || "missing"), 0);
  return Math.round((earned / Math.max(totalWeight, 0.001)) * 100);
}

function computeScoring(matches: RequirementMatch[]): ScoringBreakdown {
  const roleFitScore = categoryScore(matches, ["role_title", "seniority"]);
  const domainFitScore = categoryScore(matches, ["manufacturing_domain", "industry_context"]);
  const hardSkillsFitScore = categoryScore(matches, ["hard_skill", "methodology", "education_background", "degree"]);
  const toolsFitScore = categoryScore(matches, ["tool_system"]);
  const leadershipFitScore = categoryScore(matches, ["leadership_responsibility"]);

  const mustHave = matches.filter((match) => match.requirement.mustHave);
  const mustHaveCoverage = mustHave.length
    ? Math.round(
        mustHave.reduce((sum, match) => sum + scoreSupportLevel(match.topEvidence?.supportLevel || "missing"), 0) /
          mustHave.length *
          100
      )
    : 100;

  const evidenceStrengthScore = matches.length
    ? Math.round(matches.reduce((sum, match) => sum + (match.topEvidence?.quantifiedImpactPresent ? 1 : 0), 0) / matches.length * 100)
    : 50;

  const confidenceScore = matches.length
    ? Math.round(matches.reduce((sum, match) => sum + match.confidence, 0) / matches.length * 100)
    : 50;

  const uncertaintyPenalty = Math.round(
    matches.filter((match) => match.state === "uncertain" || match.state === "weakly_supported").length / Math.max(matches.length, 1) * 28
  );

  const weights = manufacturingPack.requirementsWeighting;
  const finalScore = Math.round(
    roleFitScore * weights.role +
      domainFitScore * weights.domain +
      hardSkillsFitScore * weights.hardSkills +
      toolsFitScore * weights.tools +
      leadershipFitScore * weights.leadership +
      mustHaveCoverage * weights.mustHave +
      evidenceStrengthScore * weights.evidenceStrength -
      uncertaintyPenalty * weights.uncertaintyPenalty
  );

  return {
    roleFitScore,
    domainFitScore,
    hardSkillsFitScore,
    toolsFitScore,
    leadershipFitScore,
    mustHaveCoverage,
    evidenceStrengthScore,
    confidenceScore,
    uncertaintyPenalty,
    finalScore: Math.max(18, Math.min(96, finalScore))
  };
}

function groupRequirementsByType(requirements: Requirement[]): Record<string, Requirement[]> {
  return requirements.reduce<Record<string, Requirement[]>>((groups, requirement) => {
    const key = requirementTypeLabel(requirement.type);
    groups[key] = groups[key] || [];
    groups[key].push(requirement);
    return groups;
  }, {});
}

function groupMatches(matches: RequirementMatch[], filter: (match: RequirementMatch) => boolean): Record<string, RequirementMatch[]> {
  return matches.filter(filter).reduce<Record<string, RequirementMatch[]>>((groups, match) => {
    const key = requirementTypeLabel(match.requirement.type);
    groups[key] = groups[key] || [];
    groups[key].push(match);
    return groups;
  }, {});
}

function buildEvidenceMap(matches: RequirementMatch[]): EvidenceMapRow[] {
  return matches.map((match) => ({
    requirementId: match.requirement.id,
    requirement: match.requirement.label,
    category: requirementTypeLabel(match.requirement.type),
    importance: match.requirement.importance,
    supportLevel: match.topEvidence?.supportLevel || "missing",
    matchState: match.state,
    confidence: match.confidence,
    jdEvidence: match.requirement.sourceText,
    cvEvidence: match.topEvidence?.cvSourceText || "No direct CV evidence found.",
    rationale: match.rationale,
    mustHave: match.requirement.mustHave
  }));
}

function uncertaintyFlags(matches: RequirementMatch[], warnings: JDQualityWarning[]): string[] {
  const flags: string[] = [];
  if (matches.some((match) => match.state === "uncertain")) {
    flags.push("Some must-have requirements remain uncertain and need manual review.");
  }
  if (matches.some((match) => match.state === "weakly_supported")) {
    flags.push("Several requirements have only weak contextual support rather than explicit proof.");
  }
  if (warnings.some((warning) => warning.severity === "high_risk")) {
    flags.push("The JD itself appears broad or over-constrained, which may inflate mismatch risk.");
  }
  return flags;
}

function buildCandidateRecommendations(matches: RequirementMatch[], domain: DomainDetection): CandidateRecommendations {
  const missing = matches.filter((match) => match.state === "missing").slice(0, 4);
  const weak = matches.filter((match) => match.state === "weakly_supported" || match.state === "uncertain").slice(0, 3);
  return {
    wordingFixes: weak.map((match) => `Strengthen the wording around ${match.requirement.label} with a concrete project, scope, or result if it is true.`),
    proofGaps: missing.map((match) => `There is no clear evidence for ${match.requirement.label}. This is not fixable by wording unless you can cite real experience.`),
    likelyInterviewQuestions: manufacturingPack.interviewQuestionTemplates.slice(0, 2).concat(
      weak.map((match) => `Be ready to explain where your CV proves ${match.requirement.label}.`)
    ).slice(0, 4),
    titleAlignmentSuggestions: [
      `Align your headline with the JD's role family: ${domain.roleFamily.replace(/_/g, " ")}.`,
      "If the role expects plant or manufacturing leadership, make recent plant scope visible near the top of the CV."
    ]
  };
}

function buildRecruiterRecommendations(matches: RequirementMatch[]): RecruiterRecommendations {
  const weak = matches.filter((match) => match.state === "weakly_supported" || match.state === "uncertain").slice(0, 4);
  const missingMustHaves = matches.filter((match) => match.requirement.mustHave && match.state === "missing").slice(0, 4);
  return {
    verifyManually: missingMustHaves.map((match) => `Verify whether the candidate truly has ${match.requirement.label}; the CV does not currently prove it.`),
    weakEvidenceZones: weak.map((match) => `${match.requirement.label}: ${match.rationale}`),
    interviewProbes: weak.map((match) => `Ask for a concrete example that proves ${match.requirement.label}.`),
    possibleFalseNegatives: matches
      .filter((match) => match.state === "missing" && /(leadership|management|engineering)/i.test(match.requirement.label))
      .slice(0, 2)
      .map((match) => `This may be a wording-driven miss if the candidate has adjacent experience for ${match.requirement.label}.`)
  };
}

function buildSummary(matches: RequirementMatch[], scoring: ScoringBreakdown, domain: DomainDetection): { profileSummary: string; tailoredBio: string; strengths: string[]; weaknesses: string[]; recommendations: string[] } {
  const strengths = matches
    .filter((match) => match.state === "matched" || match.state === "partially_matched")
    .sort((left, right) => right.requirement.importance - left.requirement.importance)
    .slice(0, 5)
    .map((match) => match.requirement.label);
  const weaknesses = matches
    .filter((match) => match.state === "missing" || match.state === "uncertain")
    .sort((left, right) => Number(right.requirement.mustHave) - Number(left.requirement.mustHave) || right.requirement.importance - left.requirement.importance)
    .slice(0, 5)
    .map((match) => match.requirement.label);
  const recommendations = weaknesses.map((item) => `Clarify or prove ${item} with direct, recent evidence if it is true.`);
  const profileSummary = `The role sits in ${domain.primaryDomain.replace(/_/g, " ")} / ${domain.roleFamily.replace(/_/g, " ")}. The analysis found ${strengths.length} strong evidence-backed matches and ${weaknesses.length} real gaps or uncertain zones. Final fit should be read together with evidence strength and must-have coverage, not score alone.`;
  const tailoredBio = `Manufacturing and industrial engineering professional with proven scope in ${domain.roleFamily.replace(/_/g, " ")} environments, combining process ownership, engineering tools, operational improvement, and leadership signals that are supported by the CV.`;
  return { profileSummary, tailoredBio, strengths, weaknesses, recommendations };
}

function jobFitDecision(finalScore: number): "High" | "Medium" | "Low" {
  if (finalScore >= 78) return "High";
  if (finalScore >= 55) return "Medium";
  return "Low";
}

function buildBulletOptimization(matches: RequirementMatch[]): FitAnalysis["bulletPointOptimization"] {
  return matches
    .filter((match) => match.state === "weakly_supported" || match.state === "uncertain")
    .slice(0, 3)
    .map((match) => ({
      original: match.topEvidence?.cvSourceText || `No direct proof for ${match.requirement.label}.`,
      optimized: `If accurate, add a clearer bullet that proves ${match.requirement.label} with scope, tool/method, and measurable impact.`,
      rationale: match.rationale
    }));
}

export function buildEvidenceBasedAnalysis(resumeText: string, jobDescription: string): FitAnalysis {
  const domain = detectDomain(jobDescription);
  const requirements = extractRequirements(jobDescription, domain);
  const matches = buildMatches(resumeText, requirements);
  const scoring = computeScoring(matches);
  const jdWarnings = lintJobDescription(jobDescription, requirements);
  const uncertainty = uncertaintyFlags(matches, jdWarnings);
  const summary = buildSummary(matches, scoring, domain);
  const evidenceMap = buildEvidenceMap(matches);
  const inputHash = stableHash(resumeText, jobDescription);

  const matchedKeywords = matches
    .filter((match) => match.state === "matched" || match.state === "partially_matched")
    .map((match) => match.requirement.label)
    .filter((value) => !GENERIC_TOKENS.has(normalizeText(value)))
    .slice(0, 10);
  const missingKeywords = matches
    .filter((match) => match.state === "missing" || match.state === "uncertain")
    .map((match) => match.requirement.label)
    .filter((value) => !GENERIC_TOKENS.has(normalizeText(value)))
    .slice(0, 10);

  return {
    domainDetection: domain,
    jdRequirementsByType: groupRequirementsByType(requirements),
    matchedEvidenceByType: groupMatches(matches, (match) => match.state === "matched" || match.state === "partially_matched"),
    missingRequirementsByType: groupMatches(matches, (match) => match.state === "missing" || match.state === "uncertain" || match.state === "weakly_supported"),
    uncertaintyFlags: uncertainty,
    scoringBreakdown: scoring,
    finalScore: scoring.finalScore,
    confidenceScore: scoring.confidenceScore,
    jdQualityWarnings: jdWarnings,
    candidateRecommendations: buildCandidateRecommendations(matches, domain),
    recruiterRecommendations: buildRecruiterRecommendations(matches),
    evidenceMap,
    analysisMeta: {
      version: "evidence-beta-v1",
      analysisMode: "evidence_based_hiring_intelligence",
      vertical: "manufacturing",
      generatedAt: new Date().toISOString(),
      inputHash
    } satisfies AnalysisMeta,
    profileSummary: summary.profileSummary,
    tailoredBio: summary.tailoredBio,
    bulletPointOptimization: buildBulletOptimization(matches),
    matchedKeywords,
    missingKeywords,
    matchScore: scoring.finalScore,
    atsVisibilityScore: Math.round((scoring.roleFitScore + scoring.domainFitScore + scoring.mustHaveCoverage) / 3),
    jobFitDecision: jobFitDecision(scoring.finalScore),
    strengths: summary.strengths,
    weaknesses: summary.weaknesses,
    recommendations: summary.recommendations,
    scoringMode: "evidence-based-deterministic",
    scoreLocked: true,
    candidateViewMode: "free"
  };
}

export function previewJobDescription(jobDescription: string) {
  const domainDetection = detectDomain(jobDescription);
  const requirements = extractRequirements(jobDescription, domainDetection);
  const jdQualityWarnings = lintJobDescription(jobDescription, requirements);
  return {
    domainDetection,
    jdRequirementsByType: groupRequirementsByType(requirements),
    jdQualityWarnings,
    analysisMeta: {
      version: "evidence-beta-v1",
      analysisMode: "jd_parse_preview",
      vertical: "manufacturing",
      generatedAt: new Date().toISOString(),
      inputHash: stableHash(jobDescription)
    } satisfies AnalysisMeta
  };
}

export function previewResumeText(resumeText: string) {
  const spans = lineSpans(resumeText);
  const signals = unique(
    [
      ...manufacturingPack.toolsCatalog.filter((entry) => entry.aliases.some((alias) => includesAlias(resumeText, alias))).map((entry) => entry.canonical),
      ...manufacturingPack.methodsCatalog.filter((entry) => entry.aliases.some((alias) => includesAlias(resumeText, alias))).map((entry) => entry.canonical),
      ...manufacturingPack.domainConcepts.filter((entry) => entry.aliases.some((alias) => includesAlias(resumeText, alias))).map((entry) => entry.canonical),
      ...manufacturingPack.leadershipSignals.filter((entry) => entry.aliases.some((alias) => includesAlias(resumeText, alias))).map((entry) => entry.canonical),
      ...manufacturingPack.educationCatalog.filter((entry) => entry.aliases.some((alias) => includesAlias(resumeText, alias))).map((entry) => entry.canonical)
    ]
  );
  return {
    parsedSections: {
      topLines: spans.slice(0, 8).map((span) => span.text),
      detectedSignals: signals
    },
    analysisMeta: {
      version: "evidence-beta-v1",
      analysisMode: "cv_parse_preview",
      vertical: "manufacturing",
      generatedAt: new Date().toISOString(),
      inputHash: stableHash(resumeText)
    } satisfies AnalysisMeta
  };
}
