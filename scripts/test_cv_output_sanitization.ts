import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildCvEditPlan } from "../server/cvApply/editPlan";
import { prepareSafeEditPlan } from "../server/cvApply/finalContent";

const execFileAsync = promisify(execFile);

const BANNED_PATTERNS = [
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

function createAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    profileSummary: "Experienced factory engineer.",
    tailoredBio: "Evidence-backed fit for engineering leadership roles.",
    bulletPointOptimization: [
      {
        original: "Led process improvements across production lines.",
        optimized: "If accurate, add a clearer bullet that proves Mechanical Systems ownership.",
        rationale: "Recommendation: improve proof of mechanical systems leadership.",
      },
    ],
    evidenceMap: [
      {
        requirementId: "req-1",
        requirement: "AutoCAD",
        category: "Tools / Systems",
        importance: 0.9,
        supportLevel: "explicit",
        matchState: "matched",
        confidence: 0.88,
        jdEvidence: "AutoCAD",
        cvEvidence: "Used AutoCAD in plant equipment projects.",
        rationale: "Exact tool evidence found in the CV.",
        mustHave: true,
      },
    ],
    matchedEvidenceByType: {},
    missingRequirementsByType: {},
    analysisMeta: {
      inputHash: "test-hash",
    },
    ...overrides,
  } as any;
}

function assertNoBanned(text: string) {
  for (const pattern of BANNED_PATTERNS) {
    assert.ok(!pattern.test(text), `Found banned phrase in final output: ${pattern}`);
  }
}

async function createSampleDocx(filePath: string, lines: string[]) {
  const script = [
    "from docx import Document",
    "doc = Document()",
    ...lines.map((line) => `doc.add_paragraph(${JSON.stringify(line)})`),
    `doc.save(${JSON.stringify(filePath)})`,
  ].join("\n");
  await execFileAsync("python", ["-c", script]);
}

async function createSamplePdf(filePath: string, lines: string[]) {
  const script = [
    "from reportlab.lib.pagesizes import A4",
    "from reportlab.pdfgen import canvas",
    `c = canvas.Canvas(${JSON.stringify(filePath)}, pagesize=A4)`,
    "y = 800",
    ...lines.map((line) => `c.drawString(50, y, ${JSON.stringify(line)}); y -= 20`),
    "c.save()",
  ].join("\n");
  await execFileAsync("python", ["-c", script]);
}

async function extractDocxText(filePath: string): Promise<string> {
  const script = [
    "from docx import Document",
    `doc = Document(${JSON.stringify(filePath)})`,
    "print('\\n'.join(p.text for p in doc.paragraphs if p.text))",
  ].join("\n");
  const { stdout } = await execFileAsync("python", ["-c", script]);
  return stdout;
}

async function extractPdfText(filePath: string): Promise<string> {
  const data = await fs.readFile(filePath);
  const loadingTask = getDocument({ data: new Uint8Array(data) });
  const pdf = await loadingTask.promise;
  let text = "";
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    text += content.items.map((item: any) => ("str" in item ? item.str : "")).join(" ") + "\n";
  }
  return text;
}

async function runWorker(request: Record<string, unknown>, workdir: string) {
  const requestPath = path.join(workdir, "request.json");
  await fs.writeFile(requestPath, JSON.stringify(request, null, 2), "utf8");
  const { stdout } = await execFileAsync("python", [path.join(process.cwd(), "scripts", "cv_apply_worker.py"), requestPath], {
    cwd: process.cwd(),
  });
  return JSON.parse(stdout);
}

async function testNoChangesDocx() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pulse-docx-nochange-"));
  const sourcePath = path.join(tempDir, "resume.docx");
  const outputPath = path.join(tempDir, "updated-resume.docx");
  const redlinePath = path.join(tempDir, "change-report.md");
  const resumeText = "John Doe\njohn@example.com\nHeadline\nExperience\nLed process improvements across production lines.";
  await createSampleDocx(sourcePath, ["John Doe", "john@example.com", "Headline", "Experience", "Led process improvements across production lines."]);
  const request = {
    sourcePath,
    outputPath,
    redlinePath,
    sourceFormat: "docx",
    sourceFileName: "resume.docx",
    resumeText,
    analysis: createAnalysis({ tailoredBio: "", bulletPointOptimization: [] }),
    editPlan: { instructions: [] },
  };
  await runWorker(request, tempDir);
  const text = await extractDocxText(outputPath);
  assert.match(text, /Headline/);
  assertNoBanned(text);
}

async function testDocxRewriteLeakageBlocked() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pulse-docx-leakage-"));
  const sourcePath = path.join(tempDir, "resume.docx");
  const outputPath = path.join(tempDir, "updated-resume.docx");
  const redlinePath = path.join(tempDir, "change-report.md");
  const resumeText = "John Doe\njohn@example.com\nProfessional Summary\nOperations engineer with hands-on factory experience.\nExperience\nLed process improvements across production lines.\nSkills\nAutoCAD";
  await createSampleDocx(sourcePath, [
    "John Doe",
    "john@example.com",
    "Professional Summary",
    "Operations engineer with hands-on factory experience.",
    "Experience",
    "Led process improvements across production lines.",
    "Skills",
    "AutoCAD",
  ]);

  const plan = prepareSafeEditPlan(
    buildCvEditPlan(createAnalysis(), resumeText, {
      fileName: "resume.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      format: "docx",
      base64: "",
      extractedText: resumeText,
      size: 1,
    } as any),
  ).plan;

  const request = {
    sourcePath,
    outputPath,
    redlinePath,
    sourceFormat: "docx",
    sourceFileName: "resume.docx",
    resumeText,
    analysis: createAnalysis(),
    editPlan: plan,
  };
  await runWorker(request, tempDir);
  const text = await extractDocxText(outputPath);
  assert.match(text, /Professional Summary/);
  assert.match(text, /Led process improvements across production lines\./);
  assert.ok(!/Evidence-backed fit/i.test(text));
  assert.ok(!/If accurate/i.test(text));
  assertNoBanned(text);
}

async function testPdfLeakageBlocked() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pulse-pdf-leakage-"));
  const sourcePath = path.join(tempDir, "resume.pdf");
  const outputPath = path.join(tempDir, "updated-resume.pdf");
  const expectedDocxPath = path.join(tempDir, "updated-resume.docx");
  const redlinePath = path.join(tempDir, "change-report.md");
  const resumeText = "Jane Doe\njane@example.com\nProfessional Summary\nProcess engineer with plant experience.\nExperience\nLed process improvements across production lines.";
  await createSamplePdf(sourcePath, [
    "Jane Doe",
    "jane@example.com",
    "Professional Summary",
    "Process engineer with plant experience.",
    "Experience",
    "Led process improvements across production lines.",
  ]);

  const contaminatedPlan = {
    instructions: [
      {
        id: "ins-1",
        sectionId: "sec-1",
        sectionLabel: "Profile",
        action: "insert_bullet",
        replacementText: "If accurate, add a clearer bullet that proves Mechanical Systems ownership.",
        insertionAnchor: "Professional Summary",
        rationale: "Recommendation: improve proof of mechanical systems leadership.",
        linkedRequirementIds: [],
        confidence: 0.8,
      },
    ],
  };

  const request = {
    sourcePath,
    outputPath,
    redlinePath,
    sourceFormat: "pdf",
    sourceFileName: "resume.pdf",
    resumeText,
    analysis: createAnalysis(),
    editPlan: contaminatedPlan,
  };
  const result = await runWorker(request, tempDir);
  assert.ok(Array.isArray(result.warnings));
  assert.equal(result.outputMimeType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(result.outputFileName, "updated-resume.docx");
  const text = await extractDocxText(expectedDocxPath);
  assert.match(text, /Process engineer with plant experience/);
  assert.ok(!/If accurate/i.test(text));
  assertNoBanned(text);
}

async function main() {
  await testNoChangesDocx();
  await testDocxRewriteLeakageBlocked();
  await testPdfLeakageBlocked();
  console.log("CV output sanitization tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
