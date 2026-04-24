export type RequirementType =
  | "role_title"
  | "seniority"
  | "education_background"
  | "degree"
  | "certification"
  | "hard_skill"
  | "tool_system"
  | "methodology"
  | "manufacturing_domain"
  | "leadership_responsibility"
  | "regulatory_requirement"
  | "language_requirement"
  | "years_experience"
  | "industry_context"
  | "must_have_requirement"
  | "nice_to_have_requirement";

export type SupportLevel =
  | "explicit"
  | "strong_partial"
  | "weak_partial"
  | "implied"
  | "missing"
  | "unclear";

export type EvidenceType =
  | "exact_term"
  | "normalized_alias"
  | "semantic_equivalent"
  | "responsibility_evidence"
  | "quantified_impact"
  | "tool_usage"
  | "title_signal"
  | "domain_context"
  | "education_signal";

export type MatchState =
  | "matched"
  | "partially_matched"
  | "weakly_supported"
  | "missing"
  | "uncertain";

export interface SourceSpan {
  text: string;
  start: number;
  end: number;
}

export interface DomainDetection {
  primaryDomain: string;
  secondaryDomain: string | null;
  roleFamily: string;
  seniority: string;
  confidence: number;
  signals: string[];
}

export interface Requirement {
  id: string;
  label: string;
  normalizedValue: string;
  type: RequirementType;
  subtype: string;
  sourceText: string;
  sourceSpanStart: number;
  sourceSpanEnd: number;
  domain: string;
  importance: number;
  requirementStrength: number;
  senioritySignal: string | null;
  mustHave: boolean;
  confidence: number;
}

export interface Evidence {
  requirementId: string;
  supportLevel: SupportLevel;
  confidence: number;
  cvSourceText: string;
  cvSpanStart: number;
  cvSpanEnd: number;
  evidenceType: EvidenceType;
  rationale: string;
  matchedAlias: string | null;
  recencySignal: string | null;
  strengthSignal: string | null;
  yearsInferred: number | null;
  quantifiedImpactPresent: boolean;
  ambiguityFlag: boolean;
}

export interface RequirementMatch {
  requirement: Requirement;
  evidence: Evidence[];
  state: MatchState;
  topEvidence: Evidence | null;
  confidence: number;
  rationale: string;
}

export interface JDQualityWarning {
  id: string;
  severity: "info" | "warning" | "high_risk";
  title: string;
  message: string;
  affectedRequirementIds: string[];
}

export interface ScoringBreakdown {
  roleFitScore: number;
  domainFitScore: number;
  hardSkillsFitScore: number;
  toolsFitScore: number;
  leadershipFitScore: number;
  mustHaveCoverage: number;
  evidenceStrengthScore: number;
  confidenceScore: number;
  uncertaintyPenalty: number;
  finalScore: number;
}

export interface EvidenceMapRow {
  requirementId: string;
  requirement: string;
  category: string;
  importance: number;
  supportLevel: SupportLevel;
  matchState: MatchState;
  confidence: number;
  jdEvidence: string;
  cvEvidence: string;
  rationale: string;
  mustHave: boolean;
}

export interface CandidateRecommendations {
  wordingFixes: string[];
  proofGaps: string[];
  likelyInterviewQuestions: string[];
  titleAlignmentSuggestions: string[];
}

export interface RecruiterRecommendations {
  verifyManually: string[];
  weakEvidenceZones: string[];
  interviewProbes: string[];
  possibleFalseNegatives: string[];
}

export interface AnalysisMeta {
  version: string;
  analysisMode: string;
  vertical: string;
  generatedAt: string;
  inputHash: string;
}

export interface FitAnalysis {
  domainDetection: DomainDetection;
  jdRequirementsByType: Record<string, Requirement[]>;
  matchedEvidenceByType: Record<string, RequirementMatch[]>;
  missingRequirementsByType: Record<string, RequirementMatch[]>;
  uncertaintyFlags: string[];
  scoringBreakdown: ScoringBreakdown;
  finalScore: number;
  confidenceScore: number;
  jdQualityWarnings: JDQualityWarning[];
  candidateRecommendations: CandidateRecommendations;
  recruiterRecommendations: RecruiterRecommendations;
  evidenceMap: EvidenceMapRow[];
  analysisMeta: AnalysisMeta;
  profileSummary: string;
  tailoredBio: string;
  bulletPointOptimization: {
    original: string;
    optimized: string;
    rationale: string;
  }[];
  matchedKeywords: string[];
  missingKeywords: string[];
  matchScore: number;
  atsVisibilityScore: number;
  jobFitDecision: "High" | "Medium" | "Low";
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  scoringMode: string;
  scoreLocked: boolean;
  candidateViewMode: "free" | "premium_preview";
}
