import { execFile } from "child_process";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import type { FitAnalysis } from "../analysis/types";
import type { CvEditPlan, CvGenerateRequest, CvGenerationRecord } from "./types";
import { prepareSafeEditPlan, validateFinalCvOutput } from "./finalContent";
import { ensureJobDir, writeJobMetadata } from "./storage";

const execFileAsync = promisify(execFile);

export function featureFlagEnabled(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export function createGenerationRecord(sourceFormat: "docx" | "pdf"): CvGenerationRecord {
  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();
  return {
    jobId,
    status: "queued",
    sourceFormat,
    warnings: [],
    createdAt: now,
    updatedAt: now,
  };
}

export async function runCvGenerationWorker(payload: CvGenerateRequest, record: CvGenerationRecord): Promise<CvGenerationRecord> {
  const safePlan = prepareSafeEditPlan(payload.editPlan);
  const planValidationWarnings: string[] = [];
  for (const instruction of safePlan.plan.instructions) {
    if (instruction.replacementText) {
      const validation = validateFinalCvOutput(instruction.replacementText);
      if (!validation.valid) {
        throw new Error(`Refusing to generate CV because replacement text still contains banned internal phrases: ${validation.violations.join(", ")}`);
      }
    }
  }
  planValidationWarnings.push(...safePlan.warnings);

  const jobDir = await ensureJobDir(record.jobId);
  const sourceBuffer = Buffer.from(payload.sourceDocument.base64, "base64");
  const sourcePath = path.join(jobDir, payload.sourceDocument.fileName);
  const requestPath = path.join(jobDir, "request.json");
  const outputPath = path.join(jobDir, `updated-${payload.sourceDocument.fileName.replace(/\s+/g, "-")}`);
  const redlinePath = path.join(jobDir, `change-report-${path.parse(payload.sourceDocument.fileName).name}.md`);

  await fs.writeFile(sourcePath, sourceBuffer);
  await fs.writeFile(
    requestPath,
    JSON.stringify(
      {
        sourcePath,
        outputPath,
        redlinePath,
        sourceFormat: payload.sourceDocument.format,
        sourceFileName: payload.sourceDocument.fileName,
        resumeText: payload.resumeText,
        analysis: payload.analysis,
        editPlan: safePlan.plan,
      },
      null,
      2,
    ),
    "utf-8",
  );

  const pythonBin = process.env.PYTHON_EXECUTABLE || (process.platform === "win32" ? "python" : "python3");
  const workerPath = path.join(process.cwd(), "scripts", "cv_apply_worker.py");
  record.status = "processing";
  record.updatedAt = new Date().toISOString();
  await writeJobMetadata(record);

  try {
    const { stdout } = await execFileAsync(pythonBin, [workerPath, requestPath], {
      cwd: process.cwd(),
      timeout: 180000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const result = JSON.parse(stdout.trim());
    const downloadPath = result.outputPath || outputPath;
    const updatedRecord: CvGenerationRecord = {
      ...record,
      status: "completed",
      outputFileName: result.outputFileName,
      outputMimeType: result.outputMimeType,
      downloadPath,
      redlinePath,
      warnings: Array.from(new Set([...(result.warnings || []), ...planValidationWarnings])),
      updatedAt: new Date().toISOString(),
    };
    await writeJobMetadata(updatedRecord);
    return updatedRecord;
  } catch (error: any) {
    const updatedRecord: CvGenerationRecord = {
      ...record,
      status: "failed",
      error: error.stderr?.toString() || error.message || "Document generation failed.",
      updatedAt: new Date().toISOString(),
    };
    await writeJobMetadata(updatedRecord);
    throw updatedRecord;
  }
}

export function buildChangeReportSeed(analysis: FitAnalysis, editPlan: CvEditPlan) {
  return {
    summary: analysis.profileSummary,
    warnings: editPlan.warnings,
    instructionCount: editPlan.instructions.length,
  };
}
