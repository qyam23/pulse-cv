import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const LIVE_SPACE_URL = "https://qyam23-pulse-cv.hf.space";
const ORIGINAL_CV_PATH = "C:\\Users\\user\\Downloads\\קורות חיים\\new120426\\יובל-סטרוסטה קורות חיים.pdf";
const OUTPUT_ROOT = path.join(process.cwd(), "artifacts", "live-space-consistency");
const REPORT_PATH = path.join(process.cwd(), "docs", "live-space-consistency-test-report.md");

const JD_TEXT = `About the job
What we are looking for:

We are seeking a detail-oriented technical operation Specialist to ensure the quality and compliance of materials, components, and finished products throughout all stages of production/integration. The role includes inspecting sales order confirmations, performing all aspects of incoming/in-process/final product inspections, supporting engineering and integration processes (hand on), managing RMAs and MRB cases, and documenting all activities in the CRM system

Key Responsibilities:
Applications & Technical Expertise
- Inspect and approve sales order confirmation forms
- Control production/integration quality (incoming goods, in-process, and final product verification- ATP)
- Participate in integration processes and perform testing as needed
- update ERP data with CRM system
- Manage RMA and MRB activities

Qualifications & Experience:
- Mechanical Practical Engineering or equivalent.
- Minimum 5 years of experience in technical oriented preferably involving multidisciplinary systems.
- Good technical (mechanical, optical, computer) understanding of multi-disciplinary systems
- Hands-on experience and willingness to support operational tasks as needed - Must
- Knowledge of software installation and application configuration - Must
- Mechanical and electronics knowledge, including familiarity with working/handling with electronic boards.
- Proficiency in reading and understanding technical drawings.
- Excellent communication skills in Hebrew and English (written and verbal) - Must.
- Strong analytical mindset with the ability to diagnose complex technical issues.
- Self-motivated, proactive, and able to work both independently and as part of a global team.
- Ability to work flexible hours, sometimes corresponding to overseas time schedule, and manage an intensive workload when required.
- Ability to read and interpret technical documentation and adhere to defined processes.
- Familiarity with CRM/ERP systems.
- High attention to detail, strong documentation skills, and a collaborative work approach.
`;

const BANNED_FINAL_CV_PATTERNS = [
  /if accurate/i,
  /add a bullet/i,
  /suggested/i,
  /recommendation/i,
  /evidence-backed/i,
  /consider adding/i,
  /if relevant/i,
  /if applicable/i,
  /improve proof of/i,
  /tailor this/i,
  /the cv should/i,
  /the candidate should/i,
  /recruiter-ready/i,
];

type Analysis = {
  finalScore: number;
  confidenceScore: number;
  scoringBreakdown?: {
    roleFitScore?: number;
    domainFitScore?: number;
    mustHaveCoverage?: number;
    evidenceStrengthScore?: number;
    uncertaintyPenalty?: number;
  };
  missingRequirementsByType?: Record<string, unknown[]>;
  matchedEvidenceByType?: Record<string, Array<{ state?: string; requirement?: { label?: string } }>>;
  evidenceMap?: Array<{ matchState?: string; requirement?: string; category?: string; supportLevel?: string }>;
  uncertaintyFlags?: string[];
  jdQualityWarnings?: Array<{ title?: string; message?: string; severity?: string }>;
  analysisMeta?: { version?: string; analysisMode?: string; generatedAt?: string };
};

type Metrics = {
  finalScore: number;
  mustHaveCoverage: number;
  roleFitScore: number;
  domainFitScore: number;
  confidenceScore: number;
  missingCount: number;
  weakCount: number;
  uncertaintyCount: number;
  missingItems: string[];
  weakItems: string[];
  warnings: string[];
};

type CycleResult = {
  cycle: number;
  baseline: Metrics;
  updated: Metrics | null;
  generatedFileName: string | null;
  redlineFileName: string | null;
  applyButtonEquivalent: "available" | "missing";
  editPlanShown: boolean;
  generationSucceeded: boolean;
  outputFormat: string | null;
  leakageFound: boolean;
  improvement: boolean;
  notes: string[];
};

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 240000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-cache",
        ...(init?.headers || {}),
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
    }
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadBinary(url: string, timeoutMs = 240000): Promise<Uint8Array> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "cache-control": "no-cache" },
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${(await response.text()).slice(0, 500)}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

async function extractPdfText(input: string | Uint8Array): Promise<string> {
  const data = typeof input === "string" ? new Uint8Array(await fs.readFile(input)) : input;
  const pdf = await getDocument({ data }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: any) => ("str" in item ? item.str : "")).join(" "));
  }
  return pages.join("\n").replace(/\s+\n/g, "\n").trim();
}

function countMissing(analysis: Analysis): number {
  return Object.values(analysis.missingRequirementsByType || {}).reduce((sum, list) => sum + list.length, 0);
}

function collectMissingItems(analysis: Analysis): string[] {
  const items = Object.values(analysis.missingRequirementsByType || {})
    .flat()
    .map((item: any) => item?.requirement?.label || item?.requirement || "")
    .filter(Boolean);
  return [...new Set(items)].slice(0, 12);
}

function collectWeakItems(analysis: Analysis): string[] {
  return (analysis.evidenceMap || [])
    .filter((row) => row.matchState === "weakly_supported" || row.matchState === "uncertain")
    .map((row) => row.requirement || "")
    .filter(Boolean)
    .slice(0, 12);
}

function metrics(analysis: Analysis): Metrics {
  const weakItems = collectWeakItems(analysis);
  return {
    finalScore: analysis.finalScore,
    mustHaveCoverage: analysis.scoringBreakdown?.mustHaveCoverage ?? 0,
    roleFitScore: analysis.scoringBreakdown?.roleFitScore ?? 0,
    domainFitScore: analysis.scoringBreakdown?.domainFitScore ?? 0,
    confidenceScore: analysis.confidenceScore,
    missingCount: countMissing(analysis),
    weakCount: weakItems.length,
    uncertaintyCount: analysis.uncertaintyFlags?.length || 0,
    missingItems: collectMissingItems(analysis),
    weakItems,
    warnings: [
      ...(analysis.uncertaintyFlags || []),
      ...(analysis.jdQualityWarnings || []).map((warning) => `${warning.severity || "info"}: ${warning.title || warning.message || "JD warning"}`),
    ].slice(0, 8),
  };
}

function hasInstructionLeakage(text: string): boolean {
  return BANNED_FINAL_CV_PATTERNS.some((pattern) => pattern.test(text));
}

function improved(baseline: Metrics, updated: Metrics): boolean {
  return (
    updated.finalScore > baseline.finalScore ||
    updated.mustHaveCoverage > baseline.mustHaveCoverage ||
    updated.missingCount < baseline.missingCount ||
    updated.weakCount < baseline.weakCount ||
    updated.confidenceScore > baseline.confidenceScore
  );
}

async function postAnalyze(resumeText: string): Promise<Analysis> {
  return fetchJson(`${LIVE_SPACE_URL}/api/analyze`, {
    method: "POST",
    body: JSON.stringify({ resumeText, jobDescription: JD_TEXT }),
  });
}

async function runCycle(cycle: number, originalText: string, sourceBase64: string): Promise<CycleResult> {
  const cycleDir = path.join(OUTPUT_ROOT, `cycle-${cycle}`);
  await fs.mkdir(cycleDir, { recursive: true });
  const notes: string[] = [];

  const baselineAnalysis = await postAnalyze(originalText);
  const baseline = metrics(baselineAnalysis);

  const sourceDocument = {
    fileName: `yuval-starosta-original-cycle-${cycle}.pdf`,
    mimeType: "application/pdf",
    format: "pdf",
    base64: sourceBase64,
    extractedText: originalText,
    size: Buffer.byteLength(sourceBase64, "base64"),
  };

  let planResponse: any;
  try {
    planResponse = await fetchJson(`${LIVE_SPACE_URL}/api/cv/apply-recommendations/plan`, {
      method: "POST",
      body: JSON.stringify({ analysis: baselineAnalysis, resumeText: originalText, sourceDocument }),
    });
  } catch (error: any) {
    notes.push(`Apply plan failed: ${error.message}`);
    return {
      cycle,
      baseline,
      updated: null,
      generatedFileName: null,
      redlineFileName: null,
      applyButtonEquivalent: "missing",
      editPlanShown: false,
      generationSucceeded: false,
      outputFormat: null,
      leakageFound: false,
      improvement: false,
      notes,
    };
  }

  const editPlan = planResponse.editPlan;
  const editPlanShown = Boolean(editPlan?.instructions);

  let generateResponse: any;
  try {
    generateResponse = await fetchJson(`${LIVE_SPACE_URL}/api/cv/apply-recommendations/generate`, {
      method: "POST",
      body: JSON.stringify({ analysis: baselineAnalysis, resumeText: originalText, sourceDocument, editPlan }),
    });
  } catch (error: any) {
    notes.push(`Generation failed: ${error.message}`);
    return {
      cycle,
      baseline,
      updated: null,
      generatedFileName: null,
      redlineFileName: null,
      applyButtonEquivalent: "available",
      editPlanShown,
      generationSucceeded: false,
      outputFormat: null,
      leakageFound: false,
      improvement: false,
      notes,
    };
  }

  const downloadUrl = `${LIVE_SPACE_URL}${generateResponse.downloadUrl}`;
  const updatedBytes = await downloadBinary(downloadUrl);
  const updatedFile = path.join(cycleDir, "updated-cv.pdf");
  await fs.writeFile(updatedFile, updatedBytes);

  let redlineFile: string | null = null;
  if (generateResponse.redlineUrl) {
    const redlineBytes = await downloadBinary(`${LIVE_SPACE_URL}${generateResponse.redlineUrl}`);
    redlineFile = path.join(cycleDir, "change-report.md");
    await fs.writeFile(redlineFile, redlineBytes);
  }

  const updatedText = await extractPdfText(updatedBytes);
  const leakageFound = hasInstructionLeakage(updatedText);
  if (leakageFound) {
    notes.push("Instruction leakage detected in generated PDF text.");
  }

  const updatedAnalysis = await postAnalyze(updatedText);
  const updated = metrics(updatedAnalysis);
  const didImprove = improved(baseline, updated);
  if (!didImprove) {
    notes.push("Second-pass analysis did not show directional improvement.");
  }

  await fs.writeFile(path.join(cycleDir, "baseline-analysis.json"), JSON.stringify(baselineAnalysis, null, 2), "utf8");
  await fs.writeFile(path.join(cycleDir, "updated-analysis.json"), JSON.stringify(updatedAnalysis, null, 2), "utf8");
  await fs.writeFile(path.join(cycleDir, "updated-text.txt"), updatedText, "utf8");

  return {
    cycle,
    baseline,
    updated,
    generatedFileName: updatedFile,
    redlineFileName: redlineFile,
    applyButtonEquivalent: "available",
    editPlanShown,
    generationSucceeded: generateResponse.status === "completed",
    outputFormat: "pdf",
    leakageFound,
    improvement: didImprove,
    notes,
  };
}

function formatList(items: string[]): string {
  return items.length ? items.join("; ") : "None";
}

async function writeReport(results: CycleResult[], health: any, originalTextLength: number) {
  const baselineScores = results.map((result) => result.baseline.finalScore);
  const updatedScores = results.map((result) => result.updated?.finalScore ?? 0);
  const baselineSpread = Math.max(...baselineScores) - Math.min(...baselineScores);
  const applyConsistent = results.every((result) => result.applyButtonEquivalent === "available" && result.editPlanShown && result.generationSucceeded);
  const noLeakage = results.every((result) => !result.leakageFound);
  const allImproved = results.every((result) => result.improvement);
  const verdict = applyConsistent && noLeakage && allImproved && baselineSpread <= 3 ? "PASS" : applyConsistent && noLeakage ? "PASS WITH WARNINGS" : "FAIL";

  const lines = [
    "# Pulse CV Live Space Consistency Test Report",
    "",
    "## 1. Environment",
    `- Date/time: ${new Date().toISOString()}`,
    `- Live Space URL: ${LIVE_SPACE_URL}`,
    "- Tooling: Node/tsx live API runner, pdfjs-dist PDF extraction, Hugging Face Space HTTP endpoints",
    `- Branch/commit: ${(await gitInfo()).trim()}`,
    `- Health product: ${health.product || "unknown"}`,
    `- Health scoring mode: ${health.scoringMode || "unknown"}`,
    `- Health model: ${health.model || "unknown"}`,
    `- Original CV path: ${ORIGINAL_CV_PATH}`,
    `- Original extracted text length: ${originalTextLength}`,
    "",
    "## 2. Cycle Summaries",
    "",
    "| Cycle | Baseline score | Updated score | Baseline must-have | Updated must-have | Baseline confidence | Updated confidence | Improvement? | Notes |",
    "|---|---:|---:|---:|---:|---:|---:|---|---|",
    ...results.map((result) => `| ${result.cycle} | ${result.baseline.finalScore} | ${result.updated?.finalScore ?? "N/A"} | ${result.baseline.mustHaveCoverage} | ${result.updated?.mustHaveCoverage ?? "N/A"} | ${result.baseline.confidenceScore} | ${result.updated?.confidenceScore ?? "N/A"} | ${result.improvement ? "Yes" : "No"} | ${result.notes.length ? result.notes.join("; ") : "OK"} |`),
    "",
    "| Cycle | Baseline missing items | Updated missing items | Baseline weak evidence | Updated weak evidence | Verdict |",
    "|---|---|---|---|---|---|",
    ...results.map((result) => `| ${result.cycle} | ${formatList(result.baseline.missingItems)} | ${formatList(result.updated?.missingItems || [])} | ${formatList(result.baseline.weakItems)} | ${formatList(result.updated?.weakItems || [])} | ${result.generationSucceeded && !result.leakageFound ? (result.improvement ? "Improved" : "No directional improvement") : "Failed"} |`),
    "",
    "## 3. Apply Recommendations Behavior",
    ...results.flatMap((result) => [
      `### Cycle ${result.cycle}`,
      `- Apply action available after baseline analysis: ${result.applyButtonEquivalent === "available" ? "yes" : "no"}`,
      `- Edit-plan preview equivalent returned by API: ${result.editPlanShown ? "yes" : "no"}`,
      `- Generation succeeded: ${result.generationSucceeded ? "yes" : "no"}`,
      `- Output format generated: ${result.outputFormat || "N/A"}`,
      `- Generated file: ${result.generatedFileName || "N/A"}`,
      `- Change report: ${result.redlineFileName || "N/A"}`,
      `- Instruction leakage detected: ${result.leakageFound ? "yes" : "no"}`,
      "",
    ]),
    "## 4. Consistency Verdict",
    `- Same-input baseline spread: ${baselineSpread} points`,
    `- Baseline scores: ${baselineScores.join(", ")}`,
    `- Updated scores: ${updatedScores.join(", ")}`,
    `- Apply recommendations behaved consistently: ${applyConsistent ? "yes" : "no"}`,
    `- Generated files were free of instruction leakage: ${noLeakage ? "yes" : "no"}`,
    `- Post-edit CV improved consistently: ${allImproved ? "yes" : "no"}`,
    "",
    "## 5. Final Conclusion",
    `**${verdict}**`,
    "",
    verdict === "PASS"
      ? "All three isolated live cycles completed successfully, produced stable baseline behavior, generated recruiter-facing PDF outputs, and showed directional improvement on re-analysis."
      : verdict === "PASS WITH WARNINGS"
        ? "The live workflow is operational and generated clean files, but one or more cycles showed limited/no score movement or measurable drift that should be reviewed before treating the flow as fully validated."
        : "At least one mandatory live consistency condition failed. Review the cycle notes and generated artifacts before using this flow as production evidence.",
    "",
    "## 6. Artifact Locations",
    `- Local artifact root: ${OUTPUT_ROOT}`,
    `- Report path: ${REPORT_PATH}`,
    "",
  ];

  await fs.writeFile(REPORT_PATH, lines.join("\n"), "utf8");
}

async function gitInfo(): Promise<string> {
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const [{ stdout: branch }, { stdout: commit }] = await Promise.all([
      execFileAsync("git", ["branch", "--show-current"], { cwd: process.cwd() }),
      execFileAsync("git", ["rev-parse", "--short", "HEAD"], { cwd: process.cwd() }),
    ]);
    return `${branch.trim()} @ ${commit.trim()}`;
  } catch {
    return "unavailable";
  }
}

async function main() {
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });
  const health = await fetchJson(`${LIVE_SPACE_URL}/health`, { method: "GET" }, 180000);
  assert.equal(health.ok, true);

  const originalBytes = await fs.readFile(ORIGINAL_CV_PATH);
  const originalText = await extractPdfText(ORIGINAL_CV_PATH);
  const sourceBase64 = originalBytes.toString("base64");

  const results: CycleResult[] = [];
  for (let cycle = 1; cycle <= 3; cycle += 1) {
    console.log(`Running live cycle ${cycle}...`);
    results.push(await runCycle(cycle, originalText, sourceBase64));
  }

  await fs.writeFile(path.join(OUTPUT_ROOT, "results.json"), JSON.stringify({ health, results }, null, 2), "utf8");
  await writeReport(results, health, originalText.length);
  console.log(`Report written to ${REPORT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
