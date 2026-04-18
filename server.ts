import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API to scrape URL content
  app.post("/api/scrape", async (req, res) => {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      const $ = cheerio.load(response.data);
      
      // Basic text extraction from common job board containers
      const text = $('body').text().replace(/\s\s+/g, ' ').trim();
      res.json({ text });
    } catch (error) {
      console.error("Scraping error:", error);
      res.status(500).json({ error: "Failed to fetch URL content" });
    }
  });

  // API to analyze resume using Hugging Face Thinking Model
  app.post("/api/analyze", async (req, res) => {
    const { resumeText, jobDescription } = req.body;
    const hfKey = process.env.HUGGING_FACE_API_KEY;

    if (!hfKey) {
      return res.status(500).json({ error: "Hugging Face API key not configured." });
    }

    try {
      // Prompt for Thinking Model (DeepSeek-R1 style) - Enhanced for Language & Patterns
      const prompt = `
        <instruction>
        You are a World-Class Executive Career Architect and Master ATS Auditor.
        Analyze the following Resume against the Job Description with extreme precision.
        
        RULES:
        1. LANGUAGE: Detect the language of the inputs. If the Resume is in Hebrew, provide the entire analysis in Hebrew. If it's in English, respond in English. If they are mixed, prioritize the language of the Resume.
        2. PATTERNS: Audit the resume against industry-standard patterns (Chronological, Functional, or Hybrid). Check for "Action Verbs", "Quantifiable Results", and "Section Hierarchy".
        3. OUTPUT: Return ONLY valid JSON. No conversational text before or after the JSON.
        </instruction>

        RESUME:
        ${resumeText}

        JOB DESCRIPTION:
        ${jobDescription}

        Provide a DEEP ANALYSIS in JSON format:
        {
          "matchScore": number,
          "profileSummary": "string (in the detected language)",
          "missingKeywords": ["string"],
          "strengths": ["string"],
          "weaknesses": ["string"],
          "recommendations": ["string (based on industry patterns like Harvard/Google formats)"],
          "atsVisibilityScore": number,
          "jobFitDecision": "High" | "Medium" | "Low",
          "tailoredBio": "string (Professional bio tailored to the JD)",
          "bulletPointOptimization": [
            {
              "original": "string",
              "optimized": "string (high-impact version)",
              "rationale": "string (why this change helps with ATS or recruiters)"
            }
          ]
        }
      `;

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

      let text = response.data[0]?.generated_text || "";
      
      // Strip thinking process if present (DeepSeek-R1 format)
      if (text.includes("</think>")) {
        text = text.split("</think>")[1].trim();
      }

      // Cleanup code blocks if present
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();

      try {
        const jsonResult = JSON.parse(text);
        res.json(jsonResult);
      } catch (parseError) {
        console.error("Failed to parse AI response:", text);
        res.status(500).json({ error: "AI returned invalid JSON format." });
      }

    } catch (error: any) {
      console.error("HF Analysis error:", error.response?.data || error.message);
      res.status(500).json({ error: "AI Analysis failed via Hugging Face." });
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
