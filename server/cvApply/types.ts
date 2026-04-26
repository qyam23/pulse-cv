import type { FitAnalysis } from "../analysis/types";

export type CvSourceFormat = "docx" | "pdf";

export interface ResumeSourceDocumentPayload {
  fileName: string;
  mimeType: string;
  format: CvSourceFormat;
  base64: string;
  extractedText: string;
  size: number;
}

export type CvEditAction =
  | "replace_phrase"
  | "rewrite_bullet"
  | "insert_bullet"
  | "tighten_heading"
  | "normalize_format"
  | "leave_untouched";

export interface DisplayRecommendation {
  id: string;
  requirementId: string;
  language: string;
  message: string;
  displayOnly: true;
}

export interface InternalEditInstruction {
  id: string;
  requirementId: string;
  instruction: string;
  internalOnly: true;
}

export interface FinalCvPatch {
  id: string;
  requirementId: string;
  sectionId: string;
  sectionLabel: string;
  sourceLanguage: string;
  action: CvEditAction;
  targetText?: string;
  replacementText?: string;
  insertionAnchor?: string;
  evidenceText: string[];
  forbiddenClaims: string[];
  safeToApply: boolean;
  rationale: string;
  linkedRequirementIds: string[];
  confidence: number;
  riskLevel?: "low" | "medium" | "high";
  atsImpact?: "high" | "medium" | "low";
  recruiterReadabilityImpact?: "high" | "medium" | "low";
}

export type CvEditInstruction = FinalCvPatch;

export interface CvSectionPlanSummary {
  id: string;
  label: string;
  status: "will_change" | "unchanged" | "new_content";
  summary: string;
}

export interface CvEditPlan {
  planId: string;
  sourceFileName: string;
  sourceFormat: CvSourceFormat;
  strategy: "docx_surgical" | "pdf_recruiter_safe";
  warnings: string[];
  sections: CvSectionPlanSummary[];
  instructions: CvEditInstruction[];
  displayRecommendations: DisplayRecommendation[];
  internalInstructions: InternalEditInstruction[];
  untouchedSections: string[];
}

export interface CvGenerationRecord {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  sourceFormat: CvSourceFormat;
  outputFileName?: string;
  outputMimeType?: string;
  downloadPath?: string;
  redlinePath?: string;
  warnings: string[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CvApplyPlanRequest {
  analysis: FitAnalysis;
  resumeText: string;
  sourceDocument: ResumeSourceDocumentPayload;
}

export interface CvGenerateRequest extends CvApplyPlanRequest {
  editPlan: CvEditPlan;
}
