import fs from "fs";
import path from "path";

export interface EnrichmentContext {
  detectedRole: string | null;
  detectedSeniority: string | null;
  normalizedSkills: string[];
  identifiedMustHaves: string[];
  identifiedNiceToHaves: string[];
  missingCriticalKeywords: string[];
  impactSignalsFound: string[];
  weakBulletSignals: string[];
  sectionCoverage: Record<string, boolean>;
}

const ASSET_DIR = path.join(process.cwd(), "intelligence", "assets", "v1");

function readAsset<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(ASSET_DIR, name), "utf-8")) as T;
}

const skillAliases = readAsset<Record<string, string[]>>("skill_aliases.json");
const titleAliases = readAsset<Record<string, string[]>>("title_aliases.json");
const sectionAliases = readAsset<Record<string, string[]>>("section_aliases.json");
const seniorityTerms = readAsset<Record<string, string[]>>("seniority_terms.json");
const mustHavePatterns = readAsset<Record<string, string[]>>("must_have_patterns.json");
const impactPatterns = readAsset<Record<string, string[]>>("impact_patterns.json");

function normalizedText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ");
}

function includesTerm(text: string, term: string): boolean {
  const escaped = term
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
}

function extractByPatterns(text: string, patterns: string[]): string[] {
  const lines = text.split(/\n|\.|;/).map((line) => line.trim()).filter(Boolean);
  const regexes = patterns.map((pattern) => new RegExp(pattern, "i"));
  return lines.filter((line) => regexes.some((regex) => regex.test(line))).slice(0, 12);
}

function detectRole(jobDescription: string): string | null {
  const text = normalizedText(jobDescription);
  for (const [canonical, aliases] of Object.entries(skillless(titleAliases))) {
    if (aliases.some((alias) => includesTerm(text, alias))) return canonical;
  }
  return null;
}

function skillless<T>(value: T): T {
  const copy = { ...(value as Record<string, unknown>) };
  delete copy._meta;
  return copy as T;
}

function detectSeniority(jobDescription: string): string | null {
  const text = normalizedText(jobDescription);
  for (const level of ["senior", "mid", "junior"]) {
    const key = `${level}_signals`;
    const signals = seniorityTerms[key] || [];
    if (signals.some((signal) => includesTerm(text, signal))) return level;
  }
  return null;
}

function normalizeSkills(text: string): string[] {
  const haystack = normalizedText(text);
  const found: string[] = [];
  for (const [canonical, aliases] of Object.entries(skillless(skillAliases))) {
    if (aliases.some((alias) => includesTerm(haystack, alias))) found.push(canonical);
  }
  return found.sort();
}

function sectionCoverage(resumeText: string): Record<string, boolean> {
  const lines = resumeText.split(/\n/).map((line) => normalizedText(line.trim().replace(/[:\-]+$/, "")));
  const fullText = normalizedText(resumeText);
  const coverage: Record<string, boolean> = {};
  for (const [section, aliases] of Object.entries(skillless(sectionAliases))) {
    coverage[section] = aliases.some((alias) => lines.includes(normalizedText(alias)) || includesTerm(fullText, alias));
  }
  return coverage;
}

export function enrichPrompt(resumeText: string, jobDescription: string): EnrichmentContext {
  const resumeSkills = normalizeSkills(resumeText);
  const jdSkills = normalizeSkills(jobDescription);
  const requiredLines = extractByPatterns(jobDescription, mustHavePatterns.required_patterns || []);
  const preferredLines = extractByPatterns(jobDescription, mustHavePatterns.preferred_patterns || []);
  const missing = jdSkills.filter((skill) => !resumeSkills.includes(skill));
  const strongImpact = extractByPatterns(resumeText, impactPatterns.strong_patterns || []);
  const weakBullets = extractByPatterns(resumeText, impactPatterns.weak_patterns || []);

  return {
    detectedRole: detectRole(jobDescription),
    detectedSeniority: detectSeniority(jobDescription),
    normalizedSkills: resumeSkills,
    identifiedMustHaves: requiredLines,
    identifiedNiceToHaves: preferredLines,
    missingCriticalKeywords: missing.slice(0, 16),
    impactSignalsFound: strongImpact.slice(0, 8),
    weakBulletSignals: weakBullets.slice(0, 8),
    sectionCoverage: sectionCoverage(resumeText),
  };
}

export function buildEnrichedPrompt(resumeText: string, jobDescription: string): string {
  const enrichment = enrichPrompt(resumeText, jobDescription);
  return `
<instruction>
You are a World-Class Executive Career Architect and Master ATS Auditor.
Analyze the following Resume against the Job Description with extreme precision.

RULES:
1. LANGUAGE: Detect the language of the inputs. If the Resume is in Hebrew, provide the entire analysis in Hebrew. If it's in English, respond in English.
2. OUTPUT: Return ONLY valid JSON matching the schema below.
3. GROUNDING: Your analysis must be grounded in the structured pre-analysis provided below.
4. IMPORTANT: Do not calculate or change ATS scores. The server computes scores deterministically. You only provide explanations and rewrite suggestions.
</instruction>

<pre_analysis>
Detected Role: ${enrichment.detectedRole ?? "Unknown"}
Detected Seniority in JD: ${enrichment.detectedSeniority ?? "Unknown"}
Must-Have Requirements (extracted from JD): ${enrichment.identifiedMustHaves.join(", ")}
Nice-to-Have Requirements: ${enrichment.identifiedNiceToHaves.join(", ")}
Normalized Skills Found in Resume: ${enrichment.normalizedSkills.join(", ")}
Missing Critical Keywords: ${enrichment.missingCriticalKeywords.join(", ")}
Weak Bullet Point Signals: ${enrichment.weakBulletSignals.join(", ")}
Impact Signals Found: ${enrichment.impactSignalsFound.join(", ")}
Resume Sections Present: ${JSON.stringify(enrichment.sectionCoverage)}
</pre_analysis>

RESUME: ${resumeText}
JD: ${jobDescription}

Provide DEEP ANALYSIS in JSON:
{
  "profileSummary": "string",
  "tailoredBio": "string",
  "bulletPointOptimization": [
    { "original": "string", "optimized": "string", "rationale": "string" }
  ]
}
`;
}
