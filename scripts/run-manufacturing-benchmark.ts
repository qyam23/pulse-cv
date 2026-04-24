import fs from "fs/promises";
import path from "path";
import { buildEvidenceBasedAnalysis } from "../server/analysis/engine";

interface BenchmarkCase {
  id: string;
  description: string;
  resumeText: string;
  jobDescription: string;
  expected: {
    primaryDomain: string;
    roleFamily?: string;
    minFinalScore?: number;
    maxFinalScore?: number;
    minConfidenceScore?: number;
    mustIncludeMatched?: string[];
    mustIncludeMissing?: string[];
  };
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const filePath = path.join(process.cwd(), "benchmark", "manufacturing", "cases.json");
  const raw = await fs.readFile(filePath, "utf8");
  const cases = JSON.parse(raw) as BenchmarkCase[];

  const results = cases.map((testCase) => {
    const analysis = buildEvidenceBasedAnalysis(testCase.resumeText, testCase.jobDescription);
    const matched = new Set(analysis.matchedKeywords);
    const missing = new Set(analysis.missingKeywords);

    assert(
      analysis.domainDetection.primaryDomain === testCase.expected.primaryDomain,
      `${testCase.id}: expected primaryDomain ${testCase.expected.primaryDomain}, got ${analysis.domainDetection.primaryDomain}`
    );

    if (testCase.expected.roleFamily) {
      assert(
        analysis.domainDetection.roleFamily === testCase.expected.roleFamily,
        `${testCase.id}: expected roleFamily ${testCase.expected.roleFamily}, got ${analysis.domainDetection.roleFamily}`
      );
    }

    if (typeof testCase.expected.minFinalScore === "number") {
      assert(
        analysis.finalScore >= testCase.expected.minFinalScore,
        `${testCase.id}: expected finalScore >= ${testCase.expected.minFinalScore}, got ${analysis.finalScore}`
      );
    }

    if (typeof testCase.expected.maxFinalScore === "number") {
      assert(
        analysis.finalScore <= testCase.expected.maxFinalScore,
        `${testCase.id}: expected finalScore <= ${testCase.expected.maxFinalScore}, got ${analysis.finalScore}`
      );
    }

    if (typeof testCase.expected.minConfidenceScore === "number") {
      assert(
        analysis.confidenceScore >= testCase.expected.minConfidenceScore,
        `${testCase.id}: expected confidenceScore >= ${testCase.expected.minConfidenceScore}, got ${analysis.confidenceScore}`
      );
    }

    for (const label of testCase.expected.mustIncludeMatched || []) {
      assert(matched.has(label), `${testCase.id}: expected matchedKeywords to include "${label}"`);
    }

    for (const label of testCase.expected.mustIncludeMissing || []) {
      assert(missing.has(label), `${testCase.id}: expected missingKeywords to include "${label}"`);
    }

    return {
      id: testCase.id,
      finalScore: analysis.finalScore,
      confidenceScore: analysis.confidenceScore,
      primaryDomain: analysis.domainDetection.primaryDomain,
      roleFamily: analysis.domainDetection.roleFamily,
      matchedKeywords: analysis.matchedKeywords,
      missingKeywords: analysis.missingKeywords,
    };
  });

  console.log(JSON.stringify({ ok: true, cases: results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
