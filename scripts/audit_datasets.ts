import fs from "fs";
import path from "path";

const DATASETS = [
  "cnamuangtoun/resume-job-description-fit",
  "opensporks/resumes",
  "lang-uk/recruitment-dataset-job-descriptions-english",
  "SaitejaKumboji/resume-score-details",
];

type DatasetReport = {
  dataset: string;
  status: "accessible" | "unavailable" | "requires_auth";
  sampleRowCount: number;
  fields: string[];
  samples: Record<string, unknown>[];
  suitability: "structure_mining" | "keyword_mining" | "score_calibration" | "evaluation_only" | "reject";
  rejectionReason?: string;
};

function truncate(value: unknown): unknown {
  if (typeof value === "string") return value.slice(0, 200);
  if (Array.isArray(value)) return value.slice(0, 4).map(truncate);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 8).map(([k, v]) => [k, truncate(v)]));
  return value;
}

function recommendation(dataset: string, fields: string[]): DatasetReport["suitability"] {
  const lower = `${dataset} ${fields.join(" ")}`.toLowerCase();
  if (lower.includes("score")) return "evaluation_only";
  if (lower.includes("resume") && lower.includes("job")) return "score_calibration";
  if (lower.includes("description") || lower.includes("keyword")) return "keyword_mining";
  if (lower.includes("resume")) return "structure_mining";
  return "reject";
}

async function fetchDataset(dataset: string): Promise<DatasetReport> {
  const url = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(dataset)}&config=default&split=train&offset=0&length=2`;
  try {
    const response = await fetch(url);
    if (response.status === 401 || response.status === 403) {
      return { dataset, status: "requires_auth", sampleRowCount: 0, fields: [], samples: [], suitability: "reject", rejectionReason: "Dataset requires authentication." };
    }
    if (!response.ok) {
      return { dataset, status: "unavailable", sampleRowCount: 0, fields: [], samples: [], suitability: "reject", rejectionReason: `HTTP ${response.status}` };
    }
    const payload = await response.json();
    const rows = (payload.rows || []).map((row: any) => row.row || row).slice(0, 2);
    const fields = rows[0] ? Object.keys(rows[0]) : [];
    return {
      dataset,
      status: "accessible",
      sampleRowCount: rows.length,
      fields,
      samples: rows.map((row: Record<string, unknown>) => truncate(row) as Record<string, unknown>),
      suitability: recommendation(dataset, fields),
    };
  } catch (error: any) {
    return { dataset, status: "unavailable", sampleRowCount: 0, fields: [], samples: [], suitability: "reject", rejectionReason: error.message };
  }
}

async function main() {
  const reports = await Promise.all(DATASETS.map(fetchDataset));
  const artifactsDir = path.join(process.cwd(), "artifacts");
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(path.join(artifactsDir, "dataset_audit_report.json"), JSON.stringify(reports, null, 2), "utf-8");
  for (const report of reports) {
    console.log(`${report.dataset}: ${report.status}, rows=${report.sampleRowCount}, fields=${report.fields.join(", ") || "none"}, suitability=${report.suitability}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
