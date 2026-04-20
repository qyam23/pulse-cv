import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import axios from "axios";
import * as cheerio from "cheerio";
import dns from "dns/promises";
import net from "net";
import { GoogleGenAI, Type } from "@google/genai";
import { buildEnrichedPrompt } from "./intelligence/promptEnricher";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const analysisCache = new Map<string, any>();

  app.use(express.json({ limit: "2mb" }));

  function getActiveProvider(): string {
    return (process.env.AI_PROVIDER || process.env.LLM_PROVIDER || "huggingface").toLowerCase();
  }

  function hasServerSideAiToken(provider = getActiveProvider()): boolean {
    if (provider === "huggingface" || provider === "hf" || provider === "huggingface-router") {
      return Boolean(getHuggingFaceToken());
    }
    if (provider === "gemini") return Boolean(process.env.GEMINI_API_KEY);
    if (provider === "lmstudio") return true;
    return Boolean(process.env.HUGGING_FACE_API_KEY);
  }

  app.get("/health", (_req, res) => {
    const provider = getActiveProvider();
    res.json({
      ok: true,
      runtime: process.env.NODE_ENV === "production" ? "production" : "development",
      provider,
      aiConfigured: hasServerSideAiToken(provider),
      model: provider.includes("huggingface") || provider === "hf" ? getHuggingFaceModels()[0] : process.env.LM_STUDIO_MODEL || null,
      scoringMode: "deterministic",
    });
  });

  app.get("/api/provider-status", (_req, res) => {
    const provider = getActiveProvider();
    res.json({
      provider,
      aiConfigured: hasServerSideAiToken(provider),
      model: provider.includes("huggingface") || provider === "hf" ? getHuggingFaceModels()[0] : process.env.LM_STUDIO_MODEL || null,
      keyVisibleToBrowser: false,
      scoringMode: "deterministic",
    });
  });

  const STOPWORDS = new Set([
    "and", "the", "for", "with", "you", "your", "are", "our", "this", "that", "will", "from", "have", "has", "was", "were",
    "job", "role", "work", "team", "site", "company", "required", "requirements", "experience", "skills", "ability",
    "של", "על", "עם", "או", "את", "זה", "זו", "הוא", "היא", "אנחנו", "אתה", "אתם", "תפקיד", "עבודה", "דרישות", "ניסיון",
  ]);

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function normalizedForCache(value: string): string {
    return value.toLowerCase().replace(/\s+/g, " ").trim();
  }

  function analysisCacheKey(resumeText: string, jobDescription: string): string {
    return crypto
      .createHash("sha256")
      .update(`${normalizedForCache(resumeText)}\n---JD---\n${normalizedForCache(jobDescription)}`)
      .digest("hex");
  }

  function tokenize(value: string): string[] {
    const matches = normalizedForCache(value).match(/[a-z0-9+#.]{3,}|[\u0590-\u05FF]{2,}/g) || [];
    return matches
      .map((token) => token.replace(/^[^a-z0-9\u0590-\u05FF+#.]+|[^a-z0-9\u0590-\u05FF+#.]+$/g, ""))
      .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
  }

  function uniqueOrdered(values: string[]): string[] {
    const seen = new Set<string>();
    const output: string[] = [];
    for (const value of values) {
      if (!seen.has(value)) {
        seen.add(value);
        output.push(value);
      }
    }
    return output;
  }

  function extractDeterministicKeywords(jobDescription: string): string[] {
    const tokens = tokenize(jobDescription);
    const counts = new Map<string, number>();
    tokens.forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));
    const ranked = uniqueOrdered(tokens)
      .map((token) => ({ token, count: counts.get(token) || 0 }))
      .sort((a, b) => b.count - a.count || a.token.localeCompare(b.token, "he"));
    return ranked.slice(0, 28).map((entry) => entry.token);
  }

  function buildDeterministicAnalysis(resumeText: string, jobDescription: string) {
    const resumeTokens = new Set(tokenize(resumeText));
    const jdKeywords = extractDeterministicKeywords(jobDescription);
    const matchedKeywords = jdKeywords.filter((keyword) => resumeTokens.has(keyword));
    const missingKeywords = jdKeywords.filter((keyword) => !resumeTokens.has(keyword));
    const coverage = jdKeywords.length ? matchedKeywords.length / jdKeywords.length : 0;
    const hasNumbers = /(?:\d+%|\d+\s*(?:years|שנים|לקוחות|פרויקטים|עובדים|קווים|sites?))/i.test(resumeText);
    const hasEnglish = /english|אנגלית/i.test(resumeText);
    const hasLeadership = /lead|manage|manager|ניהול|הובלה|מנהל|הובל/i.test(resumeText);
    const hasTechnicalEvidence = matchedKeywords.length >= Math.max(3, Math.ceil(jdKeywords.length * 0.2));
    const evidenceBoost = (hasNumbers ? 7 : 0) + (hasEnglish ? 3 : 0) + (hasLeadership ? 4 : 0) + (hasTechnicalEvidence ? 6 : 0);
    const matchScore = Math.round(clamp(28 + coverage * 58 + evidenceBoost, 15, 92));
    const atsVisibilityScore = Math.round(clamp(25 + coverage * 60 + (hasNumbers ? 5 : 0) + (hasLeadership ? 5 : 0), 10, 90));
    const jobFitDecision = matchScore >= 78 ? "High" : matchScore >= 55 ? "Medium" : "Low";
    const rtl = /[\u0590-\u05FF]/.test(`${resumeText} ${jobDescription}`);

    return {
      matchScore,
      atsVisibilityScore,
      jobFitDecision,
      matchedKeywords: matchedKeywords.slice(0, 12),
      missingKeywords: missingKeywords.slice(0, 12),
      strengths: matchedKeywords.length
        ? matchedKeywords.slice(0, 5).map((keyword) => rtl ? `קיימת ראיה למילת המפתח: ${keyword}` : `Evidence found for: ${keyword}`)
        : [rtl ? "נמצאו מעט אותות התאמה ישירים לתיאור המשרה." : "Limited direct role keywords were found."],
      weaknesses: missingKeywords.length
        ? missingKeywords.slice(0, 5).map((keyword) => rtl ? `חסרה ראיה ברורה ל-${keyword}` : `Missing clear evidence for ${keyword}`)
        : [rtl ? "לא זוהו פערי מילות מפתח מרכזיים בבדיקה הדטרמיניסטית." : "No major keyword gaps detected by the deterministic check."],
      recommendations: missingKeywords.length
        ? missingKeywords.slice(0, 6).map((keyword) => rtl ? `אם זה נכון ומגובה בניסיון אמיתי, הוסף דוגמה שמוכיחה ${keyword}.` : `If accurate, add a concrete evidence line for ${keyword}.`)
        : [rtl ? "שמרו על ניסוח מדויק ומבוסס ראיות, בלי להוסיף ניסיון שלא קיים." : "Keep wording evidence-based and do not add experience that is not real."],
      profileSummary: rtl
        ? `ציון ATS דטרמיניסטי: ${matchScore}/100. הציון מבוסס על כיסוי מילות מפתח וראיות בקורות החיים, לא על החלטת AI.`
        : `Deterministic ATS score: ${matchScore}/100. The score is based on keyword/evidence coverage in the resume, not an AI judgment.`,
      tailoredBio: rtl
        ? "שכבת AI יכולה להציע ניסוח טוב יותר, אבל הציון עצמו נשאר קבוע ודטרמיניסטי."
        : "The AI layer can improve wording, but the score itself remains fixed and deterministic.",
      bulletPointOptimization: missingKeywords.slice(0, 3).map((keyword) => ({
        original: rtl ? `אין ראיה ברורה ל-${keyword}` : `No clear evidence for ${keyword}`,
        optimized: rtl ? `אם זה נכון: הוסף הישג/פרויקט שמדגים ${keyword}` : `If accurate: add a project or achievement that demonstrates ${keyword}`,
        rationale: rtl ? "שיפור מבוסס ראיות בלבד, ללא המצאת ניסיון." : "Evidence-based improvement only; do not invent experience.",
      })),
      scoringMode: "deterministic",
    };
  }

  function mergeDeterministicTruth(deterministic: any, aiResult: any, provider: string, model?: string) {
    return {
      ...deterministic,
      profileSummary: typeof aiResult?.profileSummary === "string" && aiResult.profileSummary.trim() ? aiResult.profileSummary : deterministic.profileSummary,
      tailoredBio: typeof aiResult?.tailoredBio === "string" && aiResult.tailoredBio.trim() ? aiResult.tailoredBio : deterministic.tailoredBio,
      bulletPointOptimization: Array.isArray(aiResult?.bulletPointOptimization) && aiResult.bulletPointOptimization.length
        ? aiResult.bulletPointOptimization.slice(0, 4)
        : deterministic.bulletPointOptimization,
      provider,
      model,
      scoringMode: "deterministic",
      scoreLocked: true,
    };
  }

  function rememberAnalysis(key: string, value: any) {
    analysisCache.set(key, value);
    if (analysisCache.size > 100) {
      const oldest = analysisCache.keys().next().value;
      analysisCache.delete(oldest);
    }
  }

  async function isSafeUrl(rawUrl: string): Promise<boolean> {
    try {
      const parsed = new URL(rawUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) return false;
      const hostname = parsed.hostname.toLowerCase();
      if (["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(hostname)) return false;
      if (hostname.endsWith(".local")) return false;
      if (isBlockedIp(hostname)) return false;
      const resolved = await dns.lookup(hostname, { all: true });
      return resolved.every((entry) => !isBlockedIp(entry.address));
    } catch {
      return false;
    }
  }

  function isBlockedIp(hostname: string): boolean {
    if (net.isIP(hostname) === 0) return false;
    if (hostname === "::1") return true;
    if (/^127\./.test(hostname)) return true;
    if (/^10\./.test(hostname)) return true;
    if (/^192\.168\./.test(hostname)) return true;
    if (/^169\.254\./.test(hostname)) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname)) return true;
    return false;
  }

  function extractProviderText(data: any): string {
    if (Array.isArray(data) && data[0]?.generated_text) return data[0].generated_text;
    if (data?.choices?.[0]?.message?.content) return data.choices[0].message.content;
    if (typeof data === "string") return data;
    return "";
  }

  function cleanAiText(text: string): string {
    let cleaned = text || "";
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    if (cleaned.includes("</think>")) cleaned = cleaned.split("</think>").pop()?.trim() || "";
    return cleaned.replace(/```json/g, "").replace(/```/g, "").trim();
  }

  function buildPrompt(resumeText: string, jobDescription: string): string {
    try {
      return buildEnrichedPrompt(resumeText, jobDescription);
    } catch (error) {
      console.warn("Prompt enrichment failed; falling back to base prompt.", error);
      return `
        <instruction>
        You are a World-Class Executive Career Architect and Master ATS Auditor.
        Analyze the following Resume against the Job Description with extreme precision.
        RULES:
        1. LANGUAGE: Detect the language of the inputs. If the Resume is in Hebrew, provide the entire analysis in Hebrew. If it's in English, respond in English.
        2. OUTPUT: Return ONLY valid JSON.
        </instruction>
        RESUME: ${resumeText}
        JD: ${jobDescription}
        Provide DEEP ANALYSIS in JSON matching the existing AnalysisResult schema.
      `;
    }
  }

  async function detectLmStudioModel(): Promise<string | null> {
    const configuredModel = process.env.LM_STUDIO_MODEL;
    if (configuredModel) return configuredModel;

    const baseUrl = process.env.LM_STUDIO_BASE_URL || "http://localhost:1234/v1";
    const response = await axios.get(`${baseUrl}/models`, { timeout: 8000 });
    const models = response.data?.data || [];
    if (!Array.isArray(models) || models.length === 0) return null;

    const preferred =
      models.find((model: any) => model.id?.toLowerCase().includes("deepseek") && model.id?.toLowerCase().includes("r1")) ||
      models.find((model: any) => model.id?.toLowerCase().includes("gemma3") || model.id?.toLowerCase().includes("gemma-3")) ||
      models[0];

    return preferred?.id || null;
  }

  function parseAnalysisJson(text: string): any {
    const cleaned = cleanAiText(text);
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : cleaned;
    return JSON.parse(jsonText);
  }

  async function analyzeWithLmStudio(resumeText: string, jobDescription: string) {
    const deterministic = buildDeterministicAnalysis(resumeText, jobDescription);
    const baseUrl = process.env.LM_STUDIO_BASE_URL || "http://localhost:1234/v1";
    const model = await detectLmStudioModel();
    if (!model) {
      const error = new Error("No model loaded in LM Studio.");
      (error as any).code = "LM_STUDIO_MODEL_MISSING";
      throw error;
    }

    const prompt = buildPrompt(resumeText, jobDescription);
    const response = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model,
        messages: [
          {
            role: "system",
            content: "You are a precise ATS resume analyzer. Return only valid JSON. Do not invent facts.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 1400,
        stream: false,
      },
      {
        timeout: 90000,
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer lm-studio",
        },
      }
    );

    const text = extractProviderText(response.data);
    const parsed = parseAnalysisJson(text);
    return mergeDeterministicTruth(deterministic, parsed, "lmstudio", model);
  }

  function getHuggingFaceToken(): string | undefined {
    return process.env.HF_TOKEN || process.env.HUGGING_FACE_API_KEY || process.env.HUGGINGFACE_API_KEY;
  }

  function getHuggingFaceModels(): string[] {
    const configured = process.env.HF_MODEL || process.env.HUGGING_FACE_MODEL;
    const candidates = process.env.HF_MODEL_CANDIDATES;
    return (configured || candidates || "Qwen/Qwen3-32B,deepseek-ai/DeepSeek-R1-Distill-Qwen-32B,Qwen/Qwen2.5-Coder-32B-Instruct")
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean);
  }

  async function analyzeWithHuggingFaceRouter(resumeText: string, jobDescription: string) {
    const deterministic = buildDeterministicAnalysis(resumeText, jobDescription);
    const token = getHuggingFaceToken();
    if (!token) {
      const error = new Error("Hugging Face token is not configured.");
      (error as any).code = "HF_TOKEN_MISSING";
      throw error;
    }

    const prompt = buildPrompt(resumeText, jobDescription);
    const models = getHuggingFaceModels();
    let lastError: any = null;

    for (const model of models) {
      try {
        const response = await axios.post(
          "https://router.huggingface.co/v1/chat/completions",
          {
            model,
            messages: [
              {
                role: "system",
                content: "You are a precise ATS resume analyzer. Return only valid JSON. Do not invent facts.",
              },
              { role: "user", content: prompt },
            ],
            temperature: 0,
            max_tokens: 1600,
            stream: false,
            response_format: { type: "json_object" },
          },
          {
            timeout: 120000,
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        const text = extractProviderText(response.data);
        const parsed = parseAnalysisJson(text);
        return mergeDeterministicTruth(deterministic, parsed, "huggingface-router", model);
      } catch (error: any) {
        lastError = error;
        const status = error.response?.status;
        console.warn(`Hugging Face model failed: ${model}`, error.response?.data || error.message);
        if (status && ![404, 429, 503, 504].includes(status)) break;
      }
    }

    throw lastError || new Error("All Hugging Face model candidates failed.");
  }

  // API to scrape URL content
  app.post("/api/scrape", async (req, res) => {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      if (!(await isSafeUrl(url))) {
        return res.status(400).json({ error: "Unsafe or unsupported URL. Only public http/https job pages are allowed." });
      }
      const response = await axios.get(url, {
        maxRedirects: 5,
        timeout: 12000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      if (response.request?.res?.responseUrl && !(await isSafeUrl(response.request.res.responseUrl))) {
        return res.status(400).json({ error: "Redirected URL is not allowed." });
      }
      const $ = cheerio.load(response.data);
      
      // Basic text extraction from common job board containers
      const text = $('body').text().replace(/\s\s+/g, ' ').trim().slice(0, 50000);
      res.json({ text });
    } catch (error) {
      console.error("Scraping error:", error);
      res.status(500).json({ error: "Failed to fetch URL content" });
    }
  });

  // API to analyze resume using Hugging Face Thinking Model
  app.post("/api/analyze", async (req, res) => {
    const { resumeText, jobDescription } = req.body;
    const provider = getActiveProvider();

    if (!resumeText || !jobDescription || typeof resumeText !== "string" || typeof jobDescription !== "string") {
      return res.status(400).json({
        error: "INPUT_MISSING",
        message: "Resume text and job description are required.",
      });
    }

    const cacheKey = analysisCacheKey(resumeText, jobDescription);
    const cached = analysisCache.get(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    const deterministic = buildDeterministicAnalysis(resumeText, jobDescription);

    if (provider === "lmstudio") {
      try {
        const result = await analyzeWithLmStudio(resumeText, jobDescription);
        rememberAnalysis(cacheKey, result);
        return res.json(result);
      } catch (error: any) {
        console.error("LM Studio analysis error:", error.response?.data || error.message);
        const result = { ...deterministic, provider: "deterministic-fallback", aiWarning: "Local AI enhancement failed; deterministic ATS score was still completed." };
        rememberAnalysis(cacheKey, result);
        return res.json(result);
      }
    }

    if (provider === "huggingface" || provider === "hf" || provider === "huggingface-router") {
      try {
        const result = await analyzeWithHuggingFaceRouter(resumeText, jobDescription);
        rememberAnalysis(cacheKey, result);
        return res.json(result);
      } catch (error: any) {
        console.error("Hugging Face router analysis error:", error.response?.data || error.message);
        const result = { ...deterministic, provider: "deterministic-fallback", aiWarning: "Hugging Face enhancement failed; deterministic ATS score was still completed." };
        rememberAnalysis(cacheKey, result);
        return res.json(result);
      }
    }

    const hfKey = process.env.HUGGING_FACE_API_KEY;

    if (!hfKey) {
      return res.status(401).json({ 
        error: "HF_KEY_MISSING", 
        message: "Hugging Face API key not configured in Settings." 
      });
    }

    try {
      const prompt = buildPrompt(resumeText, jobDescription);

      const response = await axios.post(
        "https://api-inference.huggingface.co/models/deepseek-ai/DeepSeek-R1-Distill-Qwen-32B",
        { inputs: prompt },
        {
          headers: {
            Authorization: `Bearer ${hfKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      const text = cleanAiText(extractProviderText(response.data));

      try {
        const result = mergeDeterministicTruth(deterministic, parseAnalysisJson(text), "huggingface-inference-api", "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B");
        rememberAnalysis(cacheKey, result);
        res.json(result);
      } catch (parseError) {
        const result = { ...deterministic, provider: "deterministic-fallback", aiWarning: "AI response parse failed; deterministic ATS score was still completed." };
        rememberAnalysis(cacheKey, result);
        res.json(result);
      }

    } catch (error: any) {
      console.error("HF Analysis error:", error.response?.data || error.message);
      const result = { ...deterministic, provider: "deterministic-fallback", aiWarning: "AI analysis failed; deterministic ATS score was still completed." };
      rememberAnalysis(cacheKey, result);
      res.json(result);
    }
  });

  app.post("/api/analyze-gemini", async (req, res) => {
    const { resumeText, jobDescription } = req.body;
    if (!resumeText || !jobDescription || typeof resumeText !== "string" || typeof jobDescription !== "string") {
      return res.status(400).json({
        error: "INPUT_MISSING",
        message: "Resume text and job description are required.",
      });
    }

    const cacheKey = analysisCacheKey(resumeText, jobDescription);
    const cached = analysisCache.get(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    const deterministic = buildDeterministicAnalysis(resumeText, jobDescription);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const result = { ...deterministic, provider: "deterministic-fallback", aiWarning: "Gemini key is not configured; deterministic ATS score was still completed." };
      rememberAnalysis(cacheKey, result);
      return res.json(result);
    }
    try {
      const prompt = buildPrompt(resumeText, jobDescription);
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              matchScore: { type: Type.NUMBER },
              profileSummary: { type: Type.STRING },
              missingKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
              matchedKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
              atsVisibilityScore: { type: Type.NUMBER },
              jobFitDecision: { type: Type.STRING },
              tailoredBio: { type: Type.STRING },
              bulletPointOptimization: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    original: { type: Type.STRING },
                    optimized: { type: Type.STRING },
                    rationale: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      });
      const result = mergeDeterministicTruth(deterministic, JSON.parse(response.text || "{}"), "gemini", "gemini-3-flash-preview");
      rememberAnalysis(cacheKey, result);
      res.json(result);
    } catch (error: any) {
      console.error("Gemini analysis error:", error.message);
      const result = { ...deterministic, provider: "deterministic-fallback", aiWarning: "Gemini enhancement failed; deterministic ATS score was still completed." };
      rememberAnalysis(cacheKey, result);
      res.json(result);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
