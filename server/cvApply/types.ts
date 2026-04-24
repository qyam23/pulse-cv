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

export interface CvEditInstruction {
  id: string;
  sectionId: string;
  sectionLabel: string;
  action: CvEditAction;
  targetText?: string;
  replacementText?: string;
  insertionAnchor?: string;
  rationale: string;
  linkedRequirementIds: string[];
  confidence: number;
  atsImpact?: "high" | "medium" | "low";
  recruiterReadabilityImpact?: "high" | "medium" | "low";
}

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
