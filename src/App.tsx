/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  BrainCircuit,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  Crown,
  Database,
  Download,
  Factory,
  FileSearch,
  FileText,
  Globe,
  Layers3,
  LayoutGrid,
  Loader2,
  MapPinned,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  Wand2,
  Target,
  UploadCloud,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as pdfjs from "pdfjs-dist";
import mammoth from "mammoth";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs`;

type MatchState = "matched" | "partially_matched" | "weakly_supported" | "missing" | "uncertain";
type SupportLevel = "explicit" | "strong_partial" | "weak_partial" | "implied" | "missing" | "unclear";

interface DomainDetection {
  primaryDomain: string;
  secondaryDomain: string | null;
  roleFamily: string;
  seniority: string;
  confidence: number;
  signals: string[];
}

interface Requirement {
  id: string;
  label: string;
  normalizedValue: string;
  type: string;
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

interface Evidence {
  supportLevel: SupportLevel;
  confidence: number;
  cvSourceText: string;
  rationale: string;
  matchedAlias: string | null;
  quantifiedImpactPresent: boolean;
}

interface RequirementMatch {
  requirement: Requirement;
  evidence: Evidence[];
  state: MatchState;
  topEvidence: Evidence | null;
  confidence: number;
  rationale: string;
}

interface JDQualityWarning {
  id: string;
  severity: "info" | "warning" | "high_risk";
  title: string;
  message: string;
  affectedRequirementIds: string[];
}

interface ScoringBreakdown {
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

interface EvidenceMapRow {
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

interface RecommendationBlock {
  wordingFixes: string[];
  proofGaps: string[];
  likelyInterviewQuestions: string[];
  titleAlignmentSuggestions: string[];
}

interface RecruiterRecommendationBlock {
  verifyManually: string[];
  weakEvidenceZones: string[];
  interviewProbes: string[];
  possibleFalseNegatives: string[];
}

interface AnalysisResult {
  domainDetection: DomainDetection;
  jdRequirementsByType: Record<string, Requirement[]>;
  matchedEvidenceByType: Record<string, RequirementMatch[]>;
  missingRequirementsByType: Record<string, RequirementMatch[]>;
  uncertaintyFlags: string[];
  scoringBreakdown: ScoringBreakdown;
  finalScore: number;
  confidenceScore: number;
  jdQualityWarnings: JDQualityWarning[];
  candidateRecommendations: RecommendationBlock;
  recruiterRecommendations: RecruiterRecommendationBlock;
  evidenceMap: EvidenceMapRow[];
  analysisMeta: {
    version: string;
    analysisMode: string;
    vertical: string;
    generatedAt: string;
    inputHash: string;
  };
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
  aiWarning?: string;
  cached?: boolean;
}

interface ParsePreview {
  domainDetection?: DomainDetection;
  jdRequirementsByType?: Record<string, Requirement[]>;
  jdQualityWarnings?: JDQualityWarning[];
}

type SourceFormat = "docx" | "pdf";

interface ResumeSourceDocument {
  fileName: string;
  mimeType: string;
  format: SourceFormat;
  base64: string;
  extractedText: string;
  size: number;
}

interface CvEditInstruction {
  id: string;
  sectionId: string;
  sectionLabel: string;
  action: "replace_phrase" | "rewrite_bullet" | "insert_bullet" | "tighten_heading" | "normalize_format" | "leave_untouched";
  targetText?: string;
  replacementText?: string;
  insertionAnchor?: string;
  rationale: string;
  linkedRequirementIds: string[];
  confidence: number;
  atsImpact?: "high" | "medium" | "low";
  recruiterReadabilityImpact?: "high" | "medium" | "low";
}

interface CvSectionPlanSummary {
  id: string;
  label: string;
  status: "will_change" | "unchanged" | "new_content";
  summary: string;
}

interface CvEditPlan {
  planId: string;
  sourceFileName: string;
  sourceFormat: SourceFormat;
  strategy: "docx_surgical" | "pdf_recruiter_safe";
  warnings: string[];
  sections: CvSectionPlanSummary[];
  instructions: CvEditInstruction[];
  untouchedSections: string[];
}

interface CvGenerationResponse {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  warnings: string[];
  downloadUrl: string;
  redlineUrl: string | null;
}

const LIVE_ANALYZER_URL = "https://qyam23-pulse-cv.hf.space/";
const isStaticPagesRuntime =
  (import.meta as any).env?.VITE_STATIC_PREVIEW === "true" ||
  (typeof window !== "undefined" && window.location.hostname.endsWith("github.io"));

const STAGES = [
  "Validating inputs",
  "Cleaning and normalizing JD",
  "Detecting industrial domain signals",
  "Extracting typed requirements",
  "Finding CV evidence",
  "Scoring must-haves and confidence",
  "Drafting explanations",
  "Preparing evidence map",
];

function isRTL(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function buildStaticPreviewAnalysis(resumeText: string, jobDescription: string): AnalysisResult {
  const jd = normalizeText(jobDescription);
  const resume = normalizeText(resumeText);
  const role = /factory engineer|מהנדס\/ת מפעל|מהנדס מפעל/i.test(jobDescription)
    ? "Factory Engineer"
    : /manufacturing engineer/i.test(jobDescription)
      ? "Manufacturing Engineer"
      : "Industrial Manufacturing Role";

  const phrases = [
    { label: "Continuous Improvement", aliases: ["continuous improvement", "שיפור רציף"], category: "Hard Skills" },
    { label: "Mechanical Engineering", aliases: ["mechanical engineering", "הנדסת מכונות"], category: "Education" },
    { label: "Electrical Engineering", aliases: ["electrical engineering", "הנדסת חשמל"], category: "Education" },
    { label: "AutoCAD", aliases: ["autocad"], category: "Tools / Systems" },
    { label: "SolidWorks", aliases: ["solidworks"], category: "Tools / Systems" },
    { label: "Manufacturing Processes", aliases: ["manufacturing processes", "תהליכי ייצור"], category: "Manufacturing / Domain" },
    { label: "Safety", aliases: ["safety", "בטיחות"], category: "Manufacturing / Domain" },
    { label: "Quality", aliases: ["quality", "איכות"], category: "Manufacturing / Domain" },
    { label: "Employee Management", aliases: ["ניהול עובדים", "team leadership", "lead teams"], category: "Leadership" },
  ];

  const matched = phrases.filter((phrase) => phrase.aliases.some((alias) => resume.includes(alias)));
  const missing = phrases.filter((phrase) => !phrase.aliases.some((alias) => resume.includes(alias)));
  const finalScore = Math.round(42 + (matched.length / Math.max(phrases.length, 1)) * 40);
  const confidence = 74;

  const evidenceMap = phrases.map((phrase, index) => {
    const found = matched.some((item) => item.label === phrase.label);
    return {
      requirementId: `preview-${index}`,
      requirement: phrase.label,
      category: phrase.category,
      importance: found ? 0.78 : 0.9,
      supportLevel: found ? "strong_partial" : "missing",
      matchState: found ? "partially_matched" : "missing",
      confidence: found ? 0.76 : 0.82,
      jdEvidence: phrase.label,
      cvEvidence: found ? `Found related signal for ${phrase.label} in the resume preview.` : "No direct evidence found in static preview mode.",
      rationale: found
        ? `The static preview found a close evidence signal for ${phrase.label}.`
        : `${phrase.label} appears in the JD preview but not in the resume preview.`,
      mustHave: !["Safety", "Quality"].includes(phrase.label),
    } as EvidenceMapRow;
  });

  const matchedMap: RequirementMatch[] = matched.map((phrase, index) => ({
    requirement: {
      id: `match-${index}`,
      label: phrase.label,
      normalizedValue: phrase.label,
      type: phrase.category === "Tools / Systems" ? "tool_system" : phrase.category === "Leadership" ? "leadership_responsibility" : "hard_skill",
      subtype: "preview",
      sourceText: phrase.label,
      sourceSpanStart: 0,
      sourceSpanEnd: phrase.label.length,
      domain: "manufacturing",
      importance: 0.8,
      requirementStrength: 0.8,
      senioritySignal: null,
      mustHave: true,
      confidence: 0.82,
    },
    evidence: [{
      supportLevel: "strong_partial",
      confidence: 0.76,
      cvSourceText: phrase.label,
      rationale: `Static preview found related evidence for ${phrase.label}.`,
      matchedAlias: phrase.label,
      quantifiedImpactPresent: false,
    }],
    state: "partially_matched",
    topEvidence: {
      supportLevel: "strong_partial",
      confidence: 0.76,
      cvSourceText: phrase.label,
      rationale: `Static preview found related evidence for ${phrase.label}.`,
      matchedAlias: phrase.label,
      quantifiedImpactPresent: false,
    },
    confidence: 0.76,
    rationale: `Static preview found related evidence for ${phrase.label}.`,
  }));

  const missingMap: RequirementMatch[] = missing.map((phrase, index) => ({
    requirement: {
      id: `missing-${index}`,
      label: phrase.label,
      normalizedValue: phrase.label,
      type: phrase.category === "Tools / Systems" ? "tool_system" : phrase.category === "Leadership" ? "leadership_responsibility" : "hard_skill",
      subtype: "preview",
      sourceText: phrase.label,
      sourceSpanStart: 0,
      sourceSpanEnd: phrase.label.length,
      domain: "manufacturing",
      importance: 0.9,
      requirementStrength: 0.9,
      senioritySignal: null,
      mustHave: true,
      confidence: 0.88,
    },
    evidence: [{
      supportLevel: "missing",
      confidence: 0.82,
      cvSourceText: "",
      rationale: `No direct proof was found for ${phrase.label} in the static preview.`,
      matchedAlias: null,
      quantifiedImpactPresent: false,
    }],
    state: "missing",
    topEvidence: {
      supportLevel: "missing",
      confidence: 0.82,
      cvSourceText: "",
      rationale: `No direct proof was found for ${phrase.label} in the static preview.`,
      matchedAlias: null,
      quantifiedImpactPresent: false,
    },
    confidence: 0.82,
    rationale: `No direct proof was found for ${phrase.label} in the static preview.`,
  }));

  return {
    domainDetection: {
      primaryDomain: jd.includes("manufacturing") || jd.includes("ייצור") ? "manufacturing" : "industrial",
      secondaryDomain: jd.includes("quality") || jd.includes("איכות") ? "quality" : null,
      roleFamily: role,
      seniority: /manager|lead|מנהל/.test(jobDescription) ? "leadership" : "individual_contributor",
      confidence: 0.78,
      signals: matched.map((item) => item.label).slice(0, 6),
    },
    jdRequirementsByType: {
      Role: [{
        id: "role-preview",
        label: role,
        normalizedValue: role,
        type: "role_title",
        subtype: "preview",
        sourceText: role,
        sourceSpanStart: 0,
        sourceSpanEnd: role.length,
        domain: "manufacturing",
        importance: 0.95,
        requirementStrength: 0.95,
        senioritySignal: null,
        mustHave: true,
        confidence: 0.85,
      }],
      "Hard Skills": missingMap.filter((item) => item.requirement.type === "hard_skill").map((item) => item.requirement),
      "Tools / Systems": phrases.filter((phrase) => phrase.category === "Tools / Systems").map((phrase, index) => ({
        id: `tool-preview-${index}`,
        label: phrase.label,
        normalizedValue: phrase.label,
        type: "tool_system",
        subtype: "preview",
        sourceText: phrase.label,
        sourceSpanStart: 0,
        sourceSpanEnd: phrase.label.length,
        domain: "manufacturing",
        importance: 0.86,
        requirementStrength: 0.84,
        senioritySignal: null,
        mustHave: true,
        confidence: 0.78,
      })),
    },
    matchedEvidenceByType: {
      "Matched / Partial": matchedMap,
    },
    missingRequirementsByType: {
      "Missing / Needs proof": missingMap,
    },
    uncertaintyFlags: ["Static Pages preview uses a lightweight browser-only fit preview. Open the live analyzer for the full evidence engine."],
    scoringBreakdown: {
      roleFitScore: finalScore + 2,
      domainFitScore: finalScore - 3,
      hardSkillsFitScore: finalScore - 4,
      toolsFitScore: finalScore + 1,
      leadershipFitScore: finalScore - 6,
      mustHaveCoverage: Math.max(40, finalScore - 2),
      evidenceStrengthScore: 58,
      confidenceScore: confidence,
      uncertaintyPenalty: 16,
      finalScore,
    },
    finalScore,
    confidenceScore: confidence,
    jdQualityWarnings: [
      {
        id: "static-preview-warning",
        severity: "info",
        title: "Static preview mode",
        message: "GitHub Pages does not run the full server-side extraction pipeline. Treat this as a trust-first preview rather than a full analysis.",
        affectedRequirementIds: [],
      },
    ],
    candidateRecommendations: {
      wordingFixes: ["Use the live analyzer to see full evidence-backed wording fixes."],
      proofGaps: missing.slice(0, 3).map((item) => `Add real proof for ${item.label} if you truly have it.`),
      likelyInterviewQuestions: ["Which manufacturing processes have you improved directly, and what changed?"],
      titleAlignmentSuggestions: [`Align your title and summary to ${role} if that reflects your real scope.`],
    },
    recruiterRecommendations: {
      verifyManually: ["Open the live analyzer for the full recruiter-grade evidence map."],
      weakEvidenceZones: missing.slice(0, 2).map((item) => `${item.label}: no direct proof in static preview.`),
      interviewProbes: ["Ask for one recent example proving process ownership."],
      possibleFalseNegatives: ["Static preview may miss nuanced evidence that the live analyzer can map."],
    },
    evidenceMap,
    analysisMeta: {
      version: "static-preview-evidence-v1",
      analysisMode: "static_preview",
      vertical: "manufacturing",
      generatedAt: new Date().toISOString(),
      inputHash: `${resumeText.length}-${jobDescription.length}`,
    },
    profileSummary: "This preview highlights fit as evidence and proof strength, not as a flat keyword score.",
    tailoredBio: "Candidate-first evidence preview: show what your CV truly proves, what is still missing, and what is only a wording issue.",
    bulletPointOptimization: missing.slice(0, 2).map((item) => ({
      original: `No direct proof for ${item.label}.`,
      optimized: `If this is true, add a result-driven bullet showing where you used ${item.label}.`,
      rationale: "Static preview provides a light wording hint only.",
    })),
    matchedKeywords: matched.map((item) => item.label),
    missingKeywords: missing.map((item) => item.label),
    matchScore: finalScore,
    atsVisibilityScore: Math.round((finalScore + confidence) / 2),
    jobFitDecision: finalScore >= 78 ? "High" : finalScore >= 55 ? "Medium" : "Low",
    strengths: matched.slice(0, 4).map((item) => item.label),
    weaknesses: missing.slice(0, 4).map((item) => item.label),
    recommendations: missing.slice(0, 4).map((item) => `Prove ${item.label} with a recent, concrete example.`),
    scoringMode: "static-preview",
    scoreLocked: false,
    candidateViewMode: "free",
  };
}

async function readApiError(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const errorData = await response.json();
    return errorData.message || errorData.error || "Analysis failed.";
  }
  const text = await response.text();
  if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
    return "The live backend is unavailable right now. Please try again in a moment.";
  }
  return text || "Analysis failed.";
}

function badgeClasses(state: MatchState) {
  switch (state) {
    case "matched":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "partially_matched":
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    case "weakly_supported":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "uncertain":
      return "bg-slate-100 text-slate-700 border-slate-200";
    default:
      return "bg-rose-50 text-rose-700 border-rose-200";
  }
}

function scoreTone(score: number): { label: string; className: string } {
  if (score >= 80) return { label: "High confidence fit", className: "bg-emerald-500 text-white" };
  if (score >= 60) return { label: "Selective fit", className: "bg-amber-400 text-slate-900" };
  return { label: "High review needed", className: "bg-rose-500 text-white" };
}

function groupEntries<T>(value: Record<string, T[]> | undefined): [string, T[]][] {
  return (value ? Object.entries(value).filter(([, list]) => list?.length) : []) as [string, T[]][];
}

function useAnimatedStages(active: boolean) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % STAGES.length);
    }, 900);
    return () => window.clearInterval(timer);
  }, [active]);
  return index;
}

function Badge({ state }: { state: MatchState }) {
  const labels: Record<MatchState, string> = {
    matched: "Matched",
    partially_matched: "Partial",
    weakly_supported: "Weak Evidence",
    missing: "Missing",
    uncertain: "Uncertain",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.18em] ${badgeClasses(state)}`}>
      {labels[state]}
    </span>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ComponentType<any>; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-xl font-black tracking-tight text-slate-900">{title}</h3>
          {subtitle ? <p className="mt-1 text-sm leading-relaxed text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
    </div>
  );
}

function RequirementGroup({ title, items }: { title: string; items: RequirementMatch[] }) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h4 className="text-sm font-black uppercase tracking-[0.22em] text-slate-400">{title}</h4>
        <span className="text-xs font-bold text-slate-400">{items.length} requirements</span>
      </div>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.requirement.id} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-slate-900">{item.requirement.label}</p>
                  {item.requirement.mustHave ? (
                    <span className="inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white">
                      Must-Have
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{item.rationale}</p>
                {item.topEvidence?.cvSourceText ? (
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                    <div className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">CV evidence</div>
                    {item.topEvidence.cvSourceText}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Badge state={item.state} />
                <span className="text-xs font-bold text-slate-400">confidence {Math.round(item.confidence * 100)}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EvidenceMap({ rows }: { rows: EvidenceMapRow[] }) {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-5">
        <SectionHeader
          icon={MapPinned}
          title="Evidence Map"
          subtitle="Every requirement is anchored to what the JD asked for and what the CV truly proves."
        />
      </div>
      <div className="hidden lg:block">
        <div className="grid grid-cols-[1.35fr_0.8fr_0.8fr_0.8fr_1.3fr] gap-4 border-b border-slate-100 px-6 py-4 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
          <span>Requirement</span>
          <span>Status</span>
          <span>Confidence</span>
          <span>Importance</span>
          <span>CV Evidence</span>
        </div>
        {rows.map((row) => (
          <div key={row.requirementId} className="grid grid-cols-[1.35fr_0.8fr_0.8fr_0.8fr_1.3fr] gap-4 border-b border-slate-50 px-6 py-5 last:border-b-0">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-900">{row.requirement}</span>
                {row.mustHave ? (
                  <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white">
                    Must-Have
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{row.category}</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-500">{row.rationale}</p>
            </div>
            <div className="pt-1">
              <Badge state={row.matchState} />
            </div>
            <div className="pt-2 text-sm font-bold text-slate-700">{Math.round(row.confidence * 100)}%</div>
            <div className="pt-2 text-sm font-bold text-slate-700">{Math.round(row.importance * 100)}%</div>
            <div className="text-sm leading-relaxed text-slate-600">{row.cvEvidence}</div>
          </div>
        ))}
      </div>
      <div className="space-y-4 p-5 lg:hidden">
        {rows.map((row) => (
          <div key={row.requirementId} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold text-slate-900">{row.requirement}</p>
              <Badge state={row.matchState} />
            </div>
            <p className="mt-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400">{row.category}</p>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">{row.rationale}</p>
            <div className="mt-4 grid gap-3 rounded-2xl bg-white p-4 text-sm text-slate-600">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">CV evidence</div>
                {row.cvEvidence}
              </div>
              <div className="flex gap-5 text-xs font-bold text-slate-500">
                <span>confidence {Math.round(row.confidence * 100)}%</span>
                <span>importance {Math.round(row.importance * 100)}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EditPlanModal({
  open,
  plan,
  onClose,
  onConfirm,
  isGenerating,
}: {
  open: boolean;
  plan: CvEditPlan | null;
  onClose: () => void;
  onConfirm: () => void;
  isGenerating: boolean;
}) {
  if (!open || !plan) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/80 px-4 py-8"
      >
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[2.5rem] border border-white/10 bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5 md:px-8">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Post-analysis edit plan</p>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-900">Review exactly what Pulse CV will change</h3>
            </div>
            <button onClick={onClose} className="rounded-2xl border border-slate-200 p-3 text-slate-500 transition hover:bg-slate-50">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid max-h-[calc(90vh-170px)] gap-0 overflow-auto lg:grid-cols-[0.9fr_1.1fr]">
            <div className="border-b border-slate-100 bg-slate-50/70 p-6 lg:border-b-0 lg:border-r lg:p-8">
              <div className="space-y-4">
                <div className="rounded-[1.8rem] border border-slate-200 bg-white p-5">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Generation strategy</p>
                  <p className="mt-3 text-lg font-black text-slate-900">{plan.strategy === "docx_surgical" ? "DOCX surgical patching" : "Recruiter-safe PDF regeneration"}</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">Source file: {plan.sourceFileName}</p>
                </div>

                {plan.warnings.length ? (
                  <div className="space-y-3">
                    {plan.warnings.map((warning, index) => (
                      <div key={`${warning}-${index}`} className="rounded-[1.8rem] border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-relaxed text-amber-900">
                        {warning}
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="rounded-[1.8rem] border border-slate-200 bg-white p-5">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Section impact</p>
                  <div className="mt-4 space-y-3">
                    {plan.sections.map((section) => (
                      <div key={section.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="font-black text-slate-900">{section.label}</p>
                          <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                            section.status === "will_change"
                              ? "bg-indigo-600 text-white"
                              : section.status === "new_content"
                                ? "bg-emerald-500 text-white"
                                : "bg-slate-200 text-slate-700"
                          }`}>
                            {section.status.replace("_", " ")}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-slate-500">{section.summary}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 md:p-8">
              <div className="space-y-4">
                {plan.instructions.length ? plan.instructions.map((instruction) => (
                  <div key={instruction.id} className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white">
                        {instruction.action.replace("_", " ")}
                      </span>
                      <p className="font-black text-slate-900">{instruction.sectionLabel}</p>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-slate-500">{instruction.rationale}</p>
                    {instruction.targetText ? (
                      <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Before</p>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">{instruction.targetText}</p>
                      </div>
                    ) : null}
                    {instruction.replacementText ? (
                      <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">After</p>
                        <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-800">{instruction.replacementText}</p>
                      </div>
                    ) : null}
                  </div>
                )) : (
                  <div className="rounded-[1.8rem] border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-600">
                    No safe surgical edits were generated from this analysis.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 px-6 py-5 md:flex-row md:items-center md:justify-between md:px-8">
            <p className="text-sm text-slate-500">Pulse CV will preserve untouched sections as much as possible and will not invent unsupported claims.</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button onClick={onClose} className="rounded-[1.4rem] border border-slate-200 px-5 py-3 text-sm font-black text-slate-700">
                Keep current CV
              </button>
              <button
                onClick={onConfirm}
                disabled={isGenerating || !plan.instructions.length}
                className="inline-flex items-center justify-center gap-2 rounded-[1.4rem] bg-indigo-600 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Generate updated CV
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function LoadingOverlay({ stageIndex }: { stageIndex: number }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/90 px-6"
      >
        <div className="w-full max-w-3xl rounded-[2.8rem] border border-white/10 bg-slate-900/90 p-8 shadow-2xl shadow-black/40 md:p-12">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[2rem] bg-indigo-500/15 text-indigo-300">
            <Loader2 className="h-10 w-10 animate-spin" />
          </div>
          <div className="mt-8 text-center">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-indigo-300">Evidence-Based Hiring Intelligence</p>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-white md:text-4xl">Building an auditable fit report</h2>
            <p className="mt-4 text-base leading-relaxed text-slate-300">
              We are separating the JD into typed requirements, mapping real CV evidence, scoring must-haves, and preparing the evidence map.
            </p>
          </div>
          <div className="mt-10 space-y-3">
            {STAGES.map((stage, index) => {
              const active = index === stageIndex;
              const completed = index < stageIndex;
              return (
                <div key={stage} className={`flex items-center gap-4 rounded-2xl border px-4 py-3 transition-all ${active ? "border-indigo-400/50 bg-indigo-500/10 text-white" : completed ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/5 text-slate-400"}`}>
                  {completed ? <CheckCircle2 className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : <div className="h-2.5 w-2.5 rounded-full bg-current opacity-70" />}
                  <span className="text-sm font-semibold">{stage}</span>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [resumeSourceDocument, setResumeSourceDocument] = useState<ResumeSourceDocument | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [parsePreview, setParsePreview] = useState<ParsePreview | null>(null);
  const [editPlan, setEditPlan] = useState<CvEditPlan | null>(null);
  const [generationJob, setGenerationJob] = useState<CvGenerationResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [isPreviewingJd, setIsPreviewingJd] = useState(false);
  const [isPlanningCvUpdate, setIsPlanningCvUpdate] = useState(false);
  const [isGeneratingCv, setIsGeneratingCv] = useState(false);
  const [isEditPlanOpen, setIsEditPlanOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyBioLabel, setCopyBioLabel] = useState("Copy evidence-based bio");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activePersona, setActivePersona] = useState<"candidate" | "recruiter" | "manager">("candidate");
  const inputRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const stageIndex = useAnimatedStages(isAnalyzing);

  const rtl = useMemo(() => isRTL(`${resumeText} ${jobDescription}`), [resumeText, jobDescription]);

  const scrollToInputs = useCallback(() => {
    inputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const finishAnalysis = useCallback((analysis: AnalysisResult) => {
    setResult(analysis);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }, []);

  const copyBio = useCallback(async () => {
    if (!result?.tailoredBio) return;
    await navigator.clipboard.writeText(result.tailoredBio);
    setCopyBioLabel("Copied");
    setTimeout(() => setCopyBioLabel("Copy evidence-based bio"), 1800);
  }, [result]);

  const canApplyRecommendations = Boolean(result && !isStaticPagesRuntime);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsReadingFile(true);
    setError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);
      if (file.type === "application/pdf") {
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        let fullText = "";
        for (let page = 1; page <= pdf.numPages; page += 1) {
          const current = await pdf.getPage(page);
          const textContent = await current.getTextContent();
          fullText += `${textContent.items.map((item: any) => item.str).join(" ")}\n`;
        }
        if (!fullText.trim()) throw new Error("Could not extract text from PDF.");
        setResumeText(fullText.trim());
        setResumeSourceDocument({
          fileName: file.name,
          mimeType: file.type || "application/pdf",
          format: "pdf",
          base64,
          extractedText: fullText.trim(),
          size: file.size,
        });
      } else if (file.name.endsWith(".docx") || file.type.includes("wordprocessingml")) {
        const { value } = await mammoth.extractRawText({ arrayBuffer });
        setResumeText(value.trim());
        setResumeSourceDocument({
          fileName: file.name,
          mimeType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          format: "docx",
          base64,
          extractedText: value.trim(),
          size: file.size,
        });
      } else {
        throw new Error("Use PDF or Word (.docx) files.");
      }
      setEditPlan(null);
      setGenerationJob(null);
    } catch (err: any) {
      setError(err.message || "Failed to read the uploaded file.");
    } finally {
      setIsReadingFile(false);
      event.target.value = "";
    }
  }, []);

  const handleUrlFetch = useCallback(async () => {
    if (!jobUrl) return;
    if (isStaticPagesRuntime) {
      setError("GitHub Pages cannot fetch job links. Open the live analyzer or paste the JD manually.");
      return;
    }
    setIsFetchingUrl(true);
    setError(null);
    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: jobUrl }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const data = await response.json();
      if (!data.text) throw new Error("No JD text was extracted from the link.");
      setJobDescription(data.text);
      setParsePreview(null);
    } catch (err: any) {
      setError(err.message || "Failed to fetch the job page.");
    } finally {
      setIsFetchingUrl(false);
    }
  }, [jobUrl]);

  const previewJd = useCallback(async () => {
    if (!jobDescription) {
      setError("Paste a job description or fetch a job link first.");
      return;
    }
    if (isStaticPagesRuntime) {
      setParsePreview({
        domainDetection: buildStaticPreviewAnalysis(resumeText || "manufacturing", jobDescription).domainDetection,
        jdQualityWarnings: buildStaticPreviewAnalysis(resumeText || "manufacturing", jobDescription).jdQualityWarnings,
      });
      return;
    }
    setIsPreviewingJd(true);
    setError(null);
    try {
      const response = await fetch("/api/jd/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      setParsePreview(await response.json());
    } catch (err: any) {
      setError(err.message || "JD preview failed.");
    } finally {
      setIsPreviewingJd(false);
    }
  }, [jobDescription, resumeText]);

  const previewApplyRecommendations = useCallback(async () => {
    if (!result || !resumeSourceDocument) return;
    setIsPlanningCvUpdate(true);
    setError(null);
    try {
      const response = await fetch("/api/cv/apply-recommendations/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis: result,
          resumeText,
          sourceDocument: resumeSourceDocument,
        }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const data = await response.json();
      setEditPlan(data.editPlan);
      setIsEditPlanOpen(true);
    } catch (err: any) {
      setError(err.message || "Could not prepare the CV edit plan.");
    } finally {
      setIsPlanningCvUpdate(false);
    }
  }, [result, resumeSourceDocument, resumeText]);

  const generateUpdatedCv = useCallback(async () => {
    if (!result || !resumeSourceDocument || !editPlan) return;
    setIsGeneratingCv(true);
    setError(null);
    try {
      const response = await fetch("/api/cv/apply-recommendations/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis: result,
          resumeText,
          sourceDocument: resumeSourceDocument,
          editPlan,
        }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const data = (await response.json()) as CvGenerationResponse;
      setGenerationJob(data);
      setIsEditPlanOpen(false);
    } catch (err: any) {
      setError(err.message || "Could not generate the updated CV.");
    } finally {
      setIsGeneratingCv(false);
    }
  }, [result, resumeSourceDocument, editPlan, resumeText]);

  const downloadGeneratedAsset = useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const analyze = useCallback(async () => {
    if (!resumeText || !jobDescription) {
      setError("Please provide both the resume and the target job description.");
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    setResult(null);
    setEditPlan(null);
    setGenerationJob(null);

    if (isStaticPagesRuntime) {
      window.setTimeout(() => {
        finishAnalysis(buildStaticPreviewAnalysis(resumeText, jobDescription));
        setIsAnalyzing(false);
      }, 900);
      return;
    }

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText, jobDescription }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      finishAnalysis(await response.json());
    } catch (err: any) {
      setError(err.message || "Analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  }, [finishAnalysis, jobDescription, resumeText]);

  const scoreMood = result ? scoreTone(result.finalScore) : scoreTone(64);

  return (
    <div className="min-h-screen bg-[#f7f8fc] text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
      <nav className="fixed top-0 z-[90] w-full border-b border-slate-200 bg-white/85 px-4 py-4 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <button type="button" onClick={scrollToInputs} className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
              <TrendingPulse />
            </div>
            <div className="text-left">
              <div className="text-3xl font-black tracking-tight text-slate-900">
                Pulse<span className="text-indigo-600">CV</span>
              </div>
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
                Evidence-Based Hiring Intelligence
              </div>
            </div>
          </button>

          <div className="hidden items-center gap-8 md:flex">
            <button onClick={scrollToInputs} className="text-sm font-bold text-slate-500 transition hover:text-indigo-600">Analyzer</button>
            <button onClick={() => setActivePersona("candidate")} className="text-sm font-bold text-slate-500 transition hover:text-indigo-600">Candidate View</button>
            <button onClick={() => setActivePersona("recruiter")} className="text-sm font-bold text-slate-500 transition hover:text-indigo-600">Recruiter Beta</button>
            <a href="#pricing" className="rounded-full bg-slate-900 px-6 py-3 text-sm font-black text-white shadow-lg shadow-slate-200 transition hover:bg-slate-800">
              Pricing
            </a>
          </div>

          <button className="text-slate-700 md:hidden" onClick={() => setIsMenuOpen((value) => !value)}>
            {isMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {isMenuOpen ? (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed inset-x-4 top-24 z-[80] rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl md:hidden"
          >
            <div className="flex flex-col gap-5 text-base font-bold text-slate-700">
              <button className="text-left" onClick={() => { setIsMenuOpen(false); scrollToInputs(); }}>Analyzer</button>
              <button className="text-left" onClick={() => { setIsMenuOpen(false); setActivePersona("candidate"); }}>Candidate View</button>
              <button className="text-left" onClick={() => { setIsMenuOpen(false); setActivePersona("recruiter"); }}>Recruiter Beta</button>
              <a href="#pricing" onClick={() => setIsMenuOpen(false)} className="rounded-2xl bg-slate-900 px-5 py-4 text-center text-white">Pricing</a>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-28 md:px-6">
        {isStaticPagesRuntime ? (
          <div className="mb-10 flex flex-col gap-3 rounded-[2rem] border border-amber-200 bg-amber-50 px-6 py-5 text-amber-900 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em]">Static preview mode</p>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed">
                GitHub Pages shows the trust-first product shell and a lightweight browser preview. Open the live Hugging Face Space for the full evidence engine.
              </p>
            </div>
            <a href={LIVE_ANALYZER_URL} className="inline-flex items-center justify-center rounded-2xl bg-amber-900 px-5 py-3 text-sm font-black text-white">
              Open live analyzer
            </a>
          </div>
        ) : null}

        <section className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-indigo-700">
              <ShieldCheck className="h-4 w-4" />
              Explainable Fit Intelligence for Industrial Hiring
            </div>
            <div className="space-y-5">
              <h1 className={`text-5xl font-black tracking-tight text-slate-950 md:text-7xl ${rtl ? "leading-[1.15]" : "leading-[0.98]"}`}>
                {rtl ? "הבינו מה קורות החיים באמת מוכיחים." : "See what the CV truly proves."}
              </h1>
              <p className={`max-w-2xl text-lg leading-relaxed text-slate-500 md:text-xl ${rtl ? "text-right" : ""}`}>
                {rtl
                  ? "Pulse CV מפרק את תיאור המשרה לדרישות מובנות, מאתר ראיות אמיתיות בקורות החיים, מסמן פערים אמיתיים ורמות ביטחון, ומציג מפה שניתנת להסבר, לבדיקה ולאמון."
                  : "Pulse CV decomposes the job into typed requirements, finds real evidence in the resume, highlights true gaps, and shows how confident each decision really is."}
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
              <button onClick={scrollToInputs} className="inline-flex items-center justify-center gap-3 rounded-[1.6rem] bg-slate-950 px-7 py-4 text-sm font-black uppercase tracking-[0.18em] text-white shadow-2xl shadow-slate-200">
                Start analysis
                <ArrowRight className="h-4 w-4" />
              </button>
              <a href="#pricing" className="inline-flex items-center justify-center gap-3 rounded-[1.6rem] border border-slate-200 bg-white px-7 py-4 text-sm font-black uppercase tracking-[0.18em] text-slate-700">
                View plans
              </a>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[3rem] border border-indigo-100 bg-[linear-gradient(135deg,#0f172a_0%,#312e81_55%,#4338ca_100%)] p-8 shadow-[0_40px_120px_rgba(79,70,229,0.18)] md:p-10">
            <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-white/10 blur-3xl" />
            <div className="relative z-10 space-y-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-indigo-200">Flagship view</p>
                  <h2 className="mt-2 text-3xl font-black tracking-tight text-white">Evidence Map</h2>
                </div>
                <div className="rounded-2xl bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white">
                  Beta in place
                </div>
              </div>
              <div className="grid gap-4">
                {[
                  ["Role title", "Matched", "Plant / manufacturing engineering scope appears in both JD and CV."],
                  ["Tools", "Partial", "AutoCAD and SolidWorks are visible, but only one has direct project context."],
                  ["Leadership", "Weak evidence", "Leadership exists, but plant-specific scope is only partly explicit."],
                  ["Must-have", "Missing", "Electrical engineering background is requested but not proven in the CV."],
                ].map(([label, state, note]) => (
                  <div key={label} className="rounded-[1.8rem] border border-white/10 bg-white/10 p-4 text-white/90 backdrop-blur">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-black">{label}</p>
                      <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-indigo-50">{state}</span>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-indigo-100">{note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-14 grid gap-6 md:grid-cols-3">
          {[
            ["Requirement Intelligence", "Typed requirements by category", "Role, seniority, tools, leadership, must-haves, and manufacturing context."],
            ["Evidence Mapping", "What the CV really proves", "Exact proof, partial support, weak evidence, and uncertainty with citations."],
            ["JD Quality Review", "Catch vague or overloaded briefs", "Find requirement inflation, mixed scopes, duplicate asks, and hard-to-evaluate wording."],
          ].map(([eyebrow, title, body]) => (
            <div key={title} className="rounded-[2rem] border border-slate-200 bg-white px-6 py-7 shadow-sm">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">{eyebrow}</p>
              <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-900">{title}</h3>
              <p className="mt-4 text-sm leading-relaxed text-slate-500">{body}</p>
            </div>
          ))}
        </section>

        <section ref={inputRef} className="mt-20 scroll-mt-28">
          <div className="grid gap-8 xl:grid-cols-[1fr_1fr_0.9fr]">
            <div className="rounded-[2.5rem] border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight text-slate-900">Resume intake</h3>
                    <p className="text-sm text-slate-500">Paste text or upload a PDF / Word file.</p>
                  </div>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100">
                  {isReadingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                  Upload
                  <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
              <div className="p-6">
                {resumeSourceDocument ? (
                  <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                    Source file: <span className="font-black text-slate-900">{resumeSourceDocument.fileName}</span> · output format will stay <span className="font-black text-slate-900">{resumeSourceDocument.format.toUpperCase()}</span>
                  </div>
                ) : null}
                <textarea
                  value={resumeText}
                  onChange={(event) => setResumeText(event.target.value)}
                  dir={isRTL(resumeText) ? "rtl" : "ltr"}
                  className={`h-[24rem] w-full resize-none rounded-[2rem] border border-slate-200 bg-slate-50/80 px-5 py-4 text-base leading-relaxed text-slate-700 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-50 ${isRTL(resumeText) ? "text-right" : ""}`}
                  placeholder="Paste the resume content here..."
                />
              </div>
            </div>

            <div className="rounded-[2.5rem] border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                    <BriefcaseBusiness className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight text-slate-900">Job description intake</h3>
                    <p className="text-sm text-slate-500">Paste, fetch from LinkedIn, then preview the typed requirements.</p>
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    value={jobUrl}
                    onChange={(event) => setJobUrl(event.target.value)}
                    className="h-12 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                    placeholder="LinkedIn job URL"
                  />
                  <button
                    onClick={handleUrlFetch}
                    disabled={isFetchingUrl}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isFetchingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                    link
                  </button>
                </div>
              </div>
              <div className="p-6">
                <textarea
                  value={jobDescription}
                  onChange={(event) => setJobDescription(event.target.value)}
                  dir={isRTL(jobDescription) ? "rtl" : "ltr"}
                  className={`h-[24rem] w-full resize-none rounded-[2rem] border border-slate-200 bg-slate-50/80 px-5 py-4 text-base leading-relaxed text-slate-700 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-50 ${isRTL(jobDescription) ? "text-right" : ""}`}
                  placeholder="Paste the job description here..."
                />
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-[2.5rem] border border-slate-200 bg-white p-6 shadow-sm">
                <SectionHeader
                  icon={FileSearch}
                  title="Source status"
                  subtitle="Preview the parsed job structure before you run a full fit analysis."
                />
                <div className="mt-6 space-y-4">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Current source</p>
                    <p className="mt-2 text-sm font-semibold text-slate-700">{jobUrl ? "LinkedIn URL or web job page" : "Pasted JD text"}</p>
                  </div>
                  <button
                    onClick={previewJd}
                    disabled={isPreviewingJd}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[1.6rem] border border-slate-200 bg-white px-5 py-4 text-sm font-black uppercase tracking-[0.16em] text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPreviewingJd ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Preview JD structure
                  </button>
                  <button
                    onClick={analyze}
                    disabled={isAnalyzing}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[1.8rem] bg-indigo-600 px-5 py-4 text-sm font-black uppercase tracking-[0.16em] text-white shadow-xl shadow-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
                    Run evidence analysis
                  </button>
                </div>
              </div>

              {parsePreview ? (
                <div className="rounded-[2.5rem] border border-slate-200 bg-white p-6 shadow-sm">
                  <SectionHeader
                    icon={Database}
                    title="JD extraction preview"
                    subtitle="This preview shows what the system currently sees before matching it to the CV."
                  />
                  <div className="mt-6 space-y-5">
                    {parsePreview.domainDetection ? (
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Detected domain</p>
                        <p className="mt-2 text-base font-bold text-slate-900">{parsePreview.domainDetection.primaryDomain} / {parsePreview.domainDetection.roleFamily.replace(/_/g, " ")}</p>
                        <p className="mt-2 text-sm text-slate-500">confidence {Math.round(parsePreview.domainDetection.confidence * 100)}%</p>
                      </div>
                    ) : null}
                    {groupEntries<Requirement>(parsePreview.jdRequirementsByType).slice(0, 3).map(([group, items]) => (
                      <div key={group} className="rounded-2xl border border-slate-100 bg-white p-4">
                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">{group}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {items.slice(0, 8).map((item) => (
                            <span key={item.id} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">
                              {item.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {error ? (
          <div className="mt-8 rounded-[2rem] border border-rose-200 bg-rose-50 px-6 py-5 text-sm font-semibold text-rose-700">
            {error}
          </div>
        ) : null}

        {result ? (
          <motion.section
            ref={resultsRef}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-16 space-y-8"
          >
            <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="overflow-hidden rounded-[3rem] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#172554_55%,#312e81_100%)] p-8 shadow-[0_40px_120px_rgba(15,23,42,0.18)] md:p-10">
                <div className="flex flex-wrap items-start justify-between gap-6">
                  <div className="max-w-2xl space-y-5">
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-indigo-200">Candidate view / evidence-backed summary</p>
                    <h2 className="text-4xl font-black tracking-tight text-white md:text-5xl">
                      {result.jobFitDecision === "High"
                        ? "Strong evidence-backed fit"
                        : result.jobFitDecision === "Medium"
                          ? "Selective fit with real gaps"
                          : "High review needed before applying"}
                    </h2>
                    <p className="max-w-2xl text-base leading-relaxed text-indigo-100 md:text-lg">
                      {result.profileSummary}
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <span className="rounded-full bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white">
                        domain {result.domainDetection.primaryDomain}
                      </span>
                      <span className="rounded-full bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white">
                        role {result.domainDetection.roleFamily.replace(/_/g, " ")}
                      </span>
                      <span className="rounded-full bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white">
                        confidence {result.confidenceScore}%
                      </span>
                    </div>
                  </div>
                  <div className="grid gap-4 text-right">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-indigo-200">Final fit score</div>
                      <div className="mt-1 text-7xl font-black leading-none text-white">{result.finalScore}%</div>
                    </div>
                    <div className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-xs font-black uppercase tracking-[0.2em] ${scoreMood.className}`}>
                      {scoreMood.label}
                    </div>
                  </div>
                </div>
                <div className="mt-10 grid gap-4 md:grid-cols-4">
                  {[
                    ["Must-have coverage", result.scoringBreakdown.mustHaveCoverage],
                    ["Role fit", result.scoringBreakdown.roleFitScore],
                    ["Domain fit", result.scoringBreakdown.domainFitScore],
                    ["Confidence", result.scoringBreakdown.confidenceScore],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-[2rem] border border-white/10 bg-white/10 p-5">
                      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-indigo-200">{label}</div>
                      <div className="mt-3 text-3xl font-black text-white">{value}%</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[3rem] border border-slate-200 bg-white p-8 shadow-sm">
                <SectionHeader
                  icon={ShieldCheck}
                  title="Trust layer"
                  subtitle="This report is decomposed, cited, and confidence-aware. AI is only used for wording and explanation."
                />
                <div className="mt-6 grid gap-4">
                  {result.uncertaintyFlags.length ? (
                    result.uncertaintyFlags.map((flag, index) => (
                      <div key={`${flag}-${index}`} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                        {flag}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                      No major uncertainty flags were raised in this analysis.
                    </div>
                  )}
                  {result.aiWarning ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                      {result.aiWarning}
                    </div>
                  ) : null}
                  <div className="rounded-[2rem] border border-slate-200 bg-slate-50/80 p-5">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Analysis meta</p>
                    <div className="mt-3 grid gap-2 text-sm text-slate-600">
                      <div>Mode: {result.analysisMeta.analysisMode}</div>
                      <div>Version: {result.analysisMeta.version}</div>
                      <div>Generated: {new Date(result.analysisMeta.generatedAt).toLocaleString()}</div>
                      <div>Score locked: {result.scoreLocked ? "Yes" : "No"}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {canApplyRecommendations ? (
              <div className="rounded-[2.8rem] border border-slate-200 bg-white p-8 shadow-sm">
                <SectionHeader
                  icon={Wand2}
                  title="Apply recommendations"
                  subtitle="Open beta: generate an updated Word CV from the original uploaded file, review the edit plan first, then download the updated version and the change report."
                />
                <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="rounded-[1.8rem] border border-slate-200 bg-slate-50/80 p-5">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Source document</p>
                    <p className="mt-3 text-lg font-black text-slate-900">{resumeSourceDocument?.fileName || "Upload a PDF or DOCX resume to unlock Word export"}</p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">
                      {!resumeSourceDocument
                        ? "The full analysis is free now. For best design retention, upload the original Word DOCX file rather than a PDF."
                        : resumeSourceDocument.format === "docx"
                          ? "Pulse CV will use a DOCX-first surgical patch path that keeps the original structure and styling as much as possible."
                          : "Pulse CV will generate an ATS-safe Word file from the PDF. For exact visual design retention, upload the original DOCX version."}
                    </p>
                  </div>
                  <button
                    onClick={previewApplyRecommendations}
                    disabled={isPlanningCvUpdate || !resumeSourceDocument}
                    className="inline-flex items-center justify-center gap-2 rounded-[1.6rem] bg-indigo-600 px-6 py-4 text-sm font-black text-white shadow-lg shadow-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPlanningCvUpdate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                    Apply recommendations
                  </button>
                </div>

                {generationJob ? (
                  <div className="mt-6 grid gap-4 rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 md:grid-cols-[1fr_auto] md:items-center">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700">Updated CV ready</p>
                      <p className="mt-2 text-sm leading-relaxed text-emerald-900">
                        The updated CV is ready to download. You can also download the change report to review every touched section.
                      </p>
                      {generationJob.warnings.length ? (
                        <div className="mt-3 space-y-2">
                          {generationJob.warnings.map((warning, index) => (
                            <div key={`${warning}-${index}`} className="text-sm font-semibold text-amber-800">{warning}</div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button
                        onClick={() => downloadGeneratedAsset(generationJob.downloadUrl)}
                        className="inline-flex items-center justify-center gap-2 rounded-[1.4rem] bg-slate-900 px-5 py-3 text-sm font-black text-white"
                      >
                        <Download className="h-4 w-4" />
                        Download updated CV
                      </button>
                      {generationJob.redlineUrl ? (
                        <button
                          onClick={() => downloadGeneratedAsset(generationJob.redlineUrl!)}
                          className="inline-flex items-center justify-center gap-2 rounded-[1.4rem] border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700"
                        >
                          <FileText className="h-4 w-4" />
                          Download change report
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-8 xl:grid-cols-[1fr_0.92fr]">
              <div className="space-y-8">
                <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
                  <SectionHeader
                    icon={Target}
                    title="What the role truly demands"
                    subtitle="Typed requirements are grouped so the fit is readable and auditable."
                  />
                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    {groupEntries<Requirement>(result.jdRequirementsByType).map(([group, items]) => (
                      <div key={group} className="rounded-[1.8rem] border border-slate-100 bg-slate-50/80 p-5">
                        <div className="flex items-center justify-between gap-4">
                          <h4 className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">{group}</h4>
                          <span className="text-xs font-bold text-slate-400">{items.length}</span>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {items.slice(0, 10).map((item) => (
                            <span key={item.id} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${item.mustHave ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}>
                              {item.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <EvidenceMap rows={result.evidenceMap} />

                <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
                  <SectionHeader
                    icon={AlertTriangle}
                    title="JD Quality Review"
                    subtitle="The system also audits the job description itself for vague or overloaded hiring logic."
                  />
                  <div className="mt-6 space-y-4">
                    {result.jdQualityWarnings.length ? result.jdQualityWarnings.map((warning) => (
                      <div key={warning.id} className={`rounded-[1.8rem] border p-5 ${warning.severity === "high_risk" ? "border-rose-200 bg-rose-50" : warning.severity === "warning" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-full bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700">{warning.severity.replace("_", " ")}</span>
                          <p className="font-black text-slate-900">{warning.title}</p>
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-slate-600">{warning.message}</p>
                      </div>
                    )) : (
                      <div className="rounded-[1.8rem] border border-emerald-200 bg-emerald-50 p-5 text-sm font-semibold text-emerald-800">
                        No major JD quality issues were detected in this pass.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-8">
                <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
                  <SectionHeader
                    icon={Layers3}
                    title="Requirement coverage by category"
                    subtitle="Grouped results distinguish strong proof, weak support, and real missing must-haves."
                  />
                  <div className="mt-6 space-y-6">
                    {groupEntries<RequirementMatch>(result.matchedEvidenceByType).map(([group, items]) => (
                      <div key={group}>
                        <RequirementGroup title={group} items={items.slice(0, 4)} />
                      </div>
                    ))}
                    {groupEntries<RequirementMatch>(result.missingRequirementsByType).map(([group, items]) => (
                      <div key={`${group}-missing`}>
                        <RequirementGroup title={`${group} / needs review`} items={items.slice(0, 4)} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[2.5rem] border border-slate-200 bg-[linear-gradient(135deg,#312e81_0%,#4338ca_100%)] p-8 text-white shadow-[0_35px_90px_rgba(67,56,202,0.24)]">
                  <SectionHeader
                    icon={Sparkles}
                    title="AI wording layer"
                    subtitle="This layer drafts narrative and rewrite guidance on top of the deterministic evidence model."
                  />
                  <p className={`mt-6 text-lg leading-relaxed text-indigo-50 ${isRTL(result.tailoredBio) ? "text-right" : ""}`} dir={isRTL(result.tailoredBio) ? "rtl" : "ltr"}>
                    {result.tailoredBio}
                  </p>
                  <button onClick={copyBio} className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-[1.6rem] bg-white px-5 py-4 text-sm font-black uppercase tracking-[0.18em] text-indigo-700 shadow-xl">
                    {copyBioLabel}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
                  <SectionHeader
                    icon={BookOpen}
                    title={activePersona === "candidate" ? "Candidate recommendations" : activePersona === "recruiter" ? "Recruiter recommendations" : "Hiring manager review"}
                    subtitle={activePersona === "candidate"
                      ? "Separate wording improvements from proof gaps that require real experience."
                      : activePersona === "recruiter"
                        ? "Use this mode to see weak zones and interview probes."
                        : "This beta view helps you judge JD calibration and what to probe manually."}
                  />

                  <div className="mt-6 flex flex-wrap gap-2">
                    {(["candidate", "recruiter", "manager"] as const).map((persona) => (
                      <button
                        key={persona}
                        onClick={() => setActivePersona(persona)}
                        className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.18em] ${activePersona === persona ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
                      >
                        {persona === "candidate" ? "Candidate" : persona === "recruiter" ? "Recruiter beta" : "Hiring manager beta"}
                      </button>
                    ))}
                  </div>

                  {activePersona === "candidate" ? (
                    <div className="mt-6 grid gap-4">
                      <InsightBlock title="Fixable by wording" items={result.candidateRecommendations.wordingFixes} />
                      <InsightBlock title="Not fixable by wording" items={result.candidateRecommendations.proofGaps} />
                      <InsightBlock title="Likely interview questions" items={result.candidateRecommendations.likelyInterviewQuestions} />
                      <InsightBlock title="Title alignment" items={result.candidateRecommendations.titleAlignmentSuggestions} />
                    </div>
                  ) : activePersona === "recruiter" ? (
                    <div className="mt-6 grid gap-4">
                      <InsightBlock title="Verify manually" items={result.recruiterRecommendations.verifyManually} />
                      <InsightBlock title="Weak evidence zones" items={result.recruiterRecommendations.weakEvidenceZones} />
                      <InsightBlock title="Interview probes" items={result.recruiterRecommendations.interviewProbes} />
                      <InsightBlock title="Possible false negatives" items={result.recruiterRecommendations.possibleFalseNegatives} />
                    </div>
                  ) : (
                    <div className="mt-6 grid gap-4">
                      <InsightBlock
                        title="JD quality issues to review"
                        items={result.jdQualityWarnings.map((warning) => warning.message).slice(0, 4)}
                      />
                      <InsightBlock
                        title="What to probe in interview"
                        items={result.recruiterRecommendations.interviewProbes}
                      />
                      <InsightBlock
                        title="Scope clarity checks"
                        items={[
                          "Does the role title match the actual expected leadership scope?",
                          "Are the must-haves limited to requirements that can be evaluated from CV evidence?",
                          "Is this a plant, process, maintenance, or cross-functional leadership role?",
                        ]}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
              <SectionHeader
                icon={LayoutGrid}
                title="Rewrite guidance"
                subtitle="These suggestions stay grounded in the evidence model and avoid fabricating experience."
              />
              <div className="mt-6 space-y-5">
                {result.bulletPointOptimization.map((item, index) => (
                  <div key={`${item.original}-${index}`} className="grid gap-4 rounded-[2rem] border border-slate-100 bg-slate-50/80 p-5 md:grid-cols-[0.9fr_1.1fr]">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Original</p>
                      <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm leading-relaxed text-slate-500">{item.original}</div>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">Evidence-safe rewrite</p>
                      <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-relaxed text-slate-800">
                        {item.optimized}
                      </div>
                      <p className="mt-3 text-xs leading-relaxed text-slate-500">{item.rationale}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <section id="pricing" className="rounded-[3rem] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#1e1b4b_100%)] p-8 text-white shadow-[0_40px_120px_rgba(15,23,42,0.22)] md:p-12">
              <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-5">
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-indigo-200">Open access beta</p>
                  <h2 className="text-4xl font-black tracking-tight md:text-5xl">Full evidence report is free for everyone right now.</h2>
                  <p className="max-w-xl text-base leading-relaxed text-indigo-100 md:text-lg">
                    During the beta period, the full fit breakdown, evidence map, JD quality review, recommendations, and Word export flow are open to all users. Billing can be attached later without changing the product flow.
                  </p>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <PricingCard
                    tier="Open beta"
                    price="$0"
                    features={[
                      "Full evidence map",
                      "Must-have coverage",
                      "Candidate recommendations",
                      "JD quality review",
                    ]}
                    accent="bg-white text-slate-900"
                  />
                  <PricingCard
                    tier="Included now"
                    price="$0"
                    features={[
                      "Full fit breakdown by category",
                      "Word CV export from uploaded resume",
                      "Interview question pack",
                      "Change report download",
                    ]}
                    accent="bg-indigo-500 text-white"
                    premium
                  />
                </div>
              </div>
            </section>
          </motion.section>
        ) : null}
      </main>

      <EditPlanModal
        open={isEditPlanOpen}
        plan={editPlan}
        onClose={() => setIsEditPlanOpen(false)}
        onConfirm={generateUpdatedCv}
        isGenerating={isGeneratingCv}
      />

      {isAnalyzing ? <LoadingOverlay stageIndex={stageIndex} /> : null}
    </div>
  );
}

function PricingCard({
  tier,
  price,
  features,
  accent,
  premium,
}: {
  tier: string;
  price: string;
  features: string[];
  accent: string;
  premium?: boolean;
}) {
  return (
    <div className={`rounded-[2rem] border border-white/10 p-6 shadow-2xl ${accent}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] opacity-70">{tier}</p>
          <p className="mt-3 text-4xl font-black tracking-tight">{price}</p>
        </div>
        {premium ? (
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
            <Crown className="h-5 w-5" />
          </div>
        ) : null}
      </div>
      <div className="mt-6 space-y-3">
        {features.map((feature) => (
          <div key={feature} className="flex items-start gap-3 text-sm font-semibold leading-relaxed">
            <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{feature}</span>
          </div>
        ))}
      </div>
      <button className={`mt-8 inline-flex w-full items-center justify-center rounded-[1.4rem] px-4 py-3 text-xs font-black uppercase tracking-[0.2em] ${premium ? "bg-white text-indigo-700" : "bg-slate-900 text-white"}`}>
        {premium ? "Available now" : "Open now"}
      </button>
    </div>
  );
}

function InsightBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[1.8rem] border border-slate-100 bg-slate-50/80 p-5">
      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">{title}</p>
      <div className="mt-4 space-y-3">
        {items.length ? items.map((item, index) => (
          <div key={`${title}-${index}`} className="flex items-start gap-3 text-sm leading-relaxed text-slate-700">
            <div className="mt-1 h-2.5 w-2.5 rounded-full bg-indigo-500" />
            <span>{item}</span>
          </div>
        )) : (
          <div className="text-sm text-slate-500">No items yet.</div>
        )}
      </div>
    </div>
  );
}

function TrendingPulse() {
  return <TrendingUpMini />;
}

function TrendingUpMini() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" className="h-6 w-6">
      <path d="M4 16l5-5 4 4 7-8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 7h5v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
