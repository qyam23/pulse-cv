import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
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
    });
  });

  app.get("/api/provider-status", (_req, res) => {
    const provider = getActiveProvider();
    res.json({
      provider,
      aiConfigured: hasServerSideAiToken(provider),
      model: provider.includes("huggingface") || provider === "hf" ? getHuggingFaceModels()[0] : process.env.LM_STUDIO_MODEL || null,
      keyVisibleToBrowser: false,
    });
  });

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
    return { ...parsed, provider: "lmstudio", model };
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
            temperature: 0.2,
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
        return { ...parsed, provider: "huggingface-router", model };
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

    if (provider === "lmstudio") {
      try {
        return res.json(await analyzeWithLmStudio(resumeText, jobDescription));
      } catch (error: any) {
        console.error("LM Studio analysis error:", error.response?.data || error.message);
        return res.status(503).json({
          error: error.code || "LM_STUDIO_API_ERROR",
          message: "Local AI analysis failed. Make sure LM Studio Local Server is running and a model is loaded.",
        });
      }
    }

    if (provider === "huggingface" || provider === "hf" || provider === "huggingface-router") {
      try {
        return res.json(await analyzeWithHuggingFaceRouter(resumeText, jobDescription));
      } catch (error: any) {
        console.error("Hugging Face router analysis error:", error.response?.data || error.message);
        return res.status(error.code === "HF_TOKEN_MISSING" ? 401 : 503).json({
          error: error.code || "HF_ROUTER_API_ERROR",
          message: "Hugging Face REST analysis failed. Check HF_TOKEN/HUGGING_FACE_API_KEY and model availability.",
        });
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
        res.json(parseAnalysisJson(text));
      } catch (parseError) {
        res.status(500).json({ error: "AI response parse failed" });
      }

    } catch (error: any) {
      console.error("HF Analysis error:", error.response?.data || error.message);
      res.status(500).json({ error: "HF_API_ERROR", message: "AI Analysis failed via Hugging Face." });
    }
  });

  app.post("/api/analyze-gemini", async (req, res) => {
    const { resumeText, jobDescription } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(401).json({ error: "GEMINI_KEY_MISSING", message: "Gemini API key is not configured server-side." });
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
      res.json(JSON.parse(response.text || "{}"));
    } catch (error: any) {
      console.error("Gemini analysis error:", error.message);
      res.status(500).json({ error: "GEMINI_API_ERROR", message: "AI analysis failed via Gemini fallback." });
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
