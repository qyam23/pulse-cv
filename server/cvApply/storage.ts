import fs from "fs/promises";
import path from "path";
import type { CvGenerationRecord } from "./types";

const ROOT = path.join(process.cwd(), "artifacts", "cv-generation");

async function ensureRoot() {
  await fs.mkdir(ROOT, { recursive: true });
}

export function buildJobDir(jobId: string) {
  return path.join(ROOT, jobId);
}

export async function ensureJobDir(jobId: string) {
  await ensureRoot();
  const dir = buildJobDir(jobId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function writeJobMetadata(record: CvGenerationRecord) {
  const dir = await ensureJobDir(record.jobId);
  const metadataPath = path.join(dir, "metadata.json");
  await fs.writeFile(metadataPath, JSON.stringify(record, null, 2), "utf-8");
  return metadataPath;
}

export async function readJobMetadata(jobId: string): Promise<CvGenerationRecord | null> {
  try {
    const metadataPath = path.join(buildJobDir(jobId), "metadata.json");
    const content = await fs.readFile(metadataPath, "utf-8");
    return JSON.parse(content) as CvGenerationRecord;
  } catch {
    return null;
  }
}
