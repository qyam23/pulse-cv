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
  const requirementPhraseCache = new Map<string, string[]>();

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
    "דרוש", "דרושה", "דרושים", "משרה", "חובה", "יתרון", "איזור", "אזור", "צפון", "דרום", "מרכז", "קורות", "חיים", "למייל", "ישירות", "לשלוח", "נא", "ועוד",
    "המשרה", "הצפון", "באיזור", "למפעל", "במפעל", "בתחומו", "ואחריות", "כולל", "מוביל", "יצרני", "מחלקת", "ית", "מלאה",
  ]);
  const NOISE_KEYWORDS = new Set([
    "linkedin", "sign", "join", "policy", "cookie", "cookies", "dialog", "clear", "app", "guest", "controls",
    "guidelines", "community", "privacy", "agreement", "copyright", "brand", "show", "more", "less", "skip", "user", "users", "now",
    "content", "main", "feed", "password", "forgot", "terms", "accessibility", "through", "having",
    "post", "followers", "head", "hunter", "profile", "connect", "copy", "comment", "share",
  ]);
  const HEBREW_GENERIC_TERMS = new Set([
    "חובה", "יתרון", "ניסיון", "יכולת", "יכולות", "ידע", "רמה", "גבוהה", "גבוה",
    "עבודה", "עובדים", "תחום", "בתחום", "ארגון", "בארגון", "חברה", "בחברה",
    "מפעל", "במפעל", "תפקיד", "משרה", "דרוש", "דרושה", "דרושים", "שנים",
    "שנה", "כולל", "אחר", "אחרת", "ישיר", "ישירות", "נא", "מייל", "קו״ח",
    "קורות", "חיים", "שליחה", "לשלוח", "אזור", "הצפון", "צפון", "דרום", "מרכז",
    "אישית", "אישי", "שוטפת", "שוטף", "ברמה", "בעבודה", "בתהליכים", "בתהליך",
    "בהנדסה", "בהנדסית", "בניהול", "בידע", "ביכולת", "ביכולות", "בפיתוח", "בייצור",
    "מוביל", "יצרני", "מוכח", "מחלקת", "רציף", "תעשייתי", "תעשייתית", "תהליכית", "תחת", "לחץ",
    "אנגלית", "גבוה", "גבוהה", "בהובלת", "תהליכי", "ית", "לפחות", "נדרשת",
    "מחפשת", "מרכזיים", "נרחב", "כמהנדס", "יצרנית", "ההנדסה", "הנדסת",
  ]);
  const HEBREW_PREFIXES = ["ו", "ב", "ל", "כ", "מ", "ש"];
  const HEBREW_NORMALIZATION_BASES = new Set([
    "ניהול", "הנדסה", "הנדסי", "הנדסית", "פיתוח", "ייצור", "יצור", "תהליך", "תהליכים",
    "איכות", "בטיחות", "תפעול", "פרויקטים", "פרויקט", "מכונות", "אלקטרוניקה",
    "ציוד", "מערכות", "אוטומציה", "תפוקה", "תחזוקה", "מפעל", "ארגון", "חברה",
    "עבודה", "ידע", "יכולות", "יכולת", "תעשייתי", "תעשייתית",
  ]);
  const ENGLISH_GENERIC_TERMS = new Set([
    "required", "preferred", "must", "minimum", "at", "least", "years", "year", "company",
    "role", "position", "candidate", "looking", "seeking", "needed", "strong", "high",
    "broad", "extensive", "wide", "central", "significant", "required", "experience",
  ]);
  const TECH_PHRASE_PATTERNS = [
    /AutoCAD/gi,
    /SolidWorks/gi,
    /PFMEA/gi,
    /DFM\/DFA\/DFT/gi,
    /DFM/gi,
    /DFA/gi,
    /NPI/gi,
    /RCA/gi,
    /ERP/gi,
    /CRM/gi,
    /ISO\s?\d{3,5}/gi,
    /IEC\s?\d{3,5}/gi,
    /21\s*CFR\s*820/gi,
    /Lean manufacturing/gi,
    /continuous improvement/gi,
    /process improvement/gi,
    /systems engineering/gi,
    /manufacturing processes?/gi,
    /quality management/gi,
    /safety/gi,
    /ניהול עובדים/gu,
    /ניהול תהליכי? ייצור/gu,
    /שיפור רציף/gu,
    /הנדסת מכונות/gu,
    /הנדסת חשמל/gu,
    /תעשייה וניהול/gu,
    /תהליכי? ייצור/gu,
    /ידע טכני/gu,
    /בטיחות/gu,
    /איכות/gu,
    /מחלקת הנדסה/gu,
    /הובלת מחלקת הנדסה/gu,
  ];
  const JOB_PAGE_BOILERPLATE_PATTERNS = [
    /sign in/i,
    /join now/i,
    /skip to main content/i,
    /by clicking continue/i,
    /cookie policy/i,
    /privacy policy/i,
    /user agreement/i,
    /guest controls/i,
    /community guidelines/i,
    /new to linkedin/i,
    /forgot password/i,
    /show more/i,
    /show less/i,
    /see who you know/i,
    /get notified about new/i,
    /referrals increase your chances/i,
    /by clicking continue to join or sign in/i,
    /linkedin and 1 more/i,
    /linkedin\s*$/i,
  ];
  const LINKEDIN_POST_STOP_PATTERNS = [
    /^like$/i,
    /^comment$/i,
    /^share$/i,
    /^copy$/i,
    /^facebook$/i,
    /^x$/i,
    /^view profile$/i,
    /^connect$/i,
    /^explore content categories$/i,
    /^career$/i,
    /^productivity$/i,
    /^finance$/i,
    /^technology$/i,
    /^leadership$/i,
    /^education$/i,
    /^project management$/i,
    /^user experience$/i,
    /^or$/i,
    /^open the app$/i,
    /^report this post$/i,
    /^never miss a beat on the app$/i,
    /^don.?t have the app\?/i,
    /^\d[\d,]*\s+followers$/i,
    /^\d[\d,]*\s+posts$/i,
    /^\d+[dhmw]$/i,
  ];
  const LINKEDIN_JOB_START_PATTERNS = [
    /^job description summary/i,
    /^about the job$/i,
    /^about us$/i,
    /^job description$/i,
    /^responsibilities$/i,
    /^minimum qualifications$/i,
    /^qualifications(?:\s*&\s*experience)?$/i,
    /^job summary$/i,
    /^what you['’]ll do$/i,
    /^requirements$/i,
  ];
  const LINKEDIN_JOB_STOP_PATTERNS = [
    /^similar jobs$/i,
    /^people also viewed$/i,
    /^recommended for you$/i,
    /^more jobs like this$/i,
    /^show fewer jobs like this$/i,
    /^jobs you may be interested in$/i,
    /^meet the hiring team$/i,
    /^about the company$/i,
    /^report this job$/i,
    /^save$/i,
    /^follow$/i,
    /^share$/i,
    /^join to apply/i,
    /^join with email$/i,
    /^see who .* has hired for this role$/i,
    /^direct message the job poster/i,
    /^\d[\d,]*\s+applicants$/i,
    /^seniority level$/i,
    /^employment type$/i,
    /^job function$/i,
    /^industries$/i,
    /^get notified about new/i,
    /^sign in to set job alerts$/i,
    /^additional information/i,
    /equal opportunity employer/i,
    /^our total rewards/i,
    /^our mission is/i,
  ];
  const LINKEDIN_JOB_TITLE_SELECTORS = [
    ".topcard__title",
    ".job-details-jobs-unified-top-card__job-title h1",
    ".job-details-jobs-unified-top-card__job-title",
    "h1",
  ];
  const LINKEDIN_JOB_COMPANY_SELECTORS = [
    ".topcard__org-name-link",
    ".job-details-jobs-unified-top-card__company-name a",
    ".job-details-jobs-unified-top-card__company-name",
  ];
  const LINKEDIN_JOB_LOCATION_SELECTORS = [
    ".topcard__flavor--bullet",
    ".job-details-jobs-unified-top-card__primary-description-container",
  ];
  const LINKEDIN_JOB_DESCRIPTION_SELECTORS = [
    ".description__text .show-more-less-html__markup",
    ".description__text--rich .show-more-less-html__markup",
    ".show-more-less-html__markup",
    ".description__text",
  ];

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function normalizedForCache(value: string): string {
    return value.toLowerCase().replace(/\s+/g, " ").trim();
  }

  function normalizeKeywordToken(token: string): string {
    let value = token.toLowerCase().trim();
    if (/^[\u0590-\u05FF]+$/u.test(value)) {
      while (value.length >= 5 && HEBREW_PREFIXES.includes(value[0])) {
        const candidate = value.slice(1);
        if (HEBREW_GENERIC_TERMS.has(candidate) || HEBREW_NORMALIZATION_BASES.has(candidate)) {
          value = candidate;
          break;
        }
        break;
      }
    }
    return value;
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
      .map((token) => token.replace(/^[^a-z0-9\u0590-\u05FF+#]+|[^a-z0-9\u0590-\u05FF+#]+$/g, ""))
      .map((token) => normalizeKeywordToken(token))
      .filter((token) => token.length >= 2 && !STOPWORDS.has(token) && !NOISE_KEYWORDS.has(token))
      .filter((token) => !HEBREW_GENERIC_TERMS.has(token))
      .filter((token) => !/^(גבוה|גבוהה|ישיר|ישירות|אישי|אישית|שוטף|שוטפת)$/u.test(token))
      .filter((token) => !looksLikeContactNoise(token));
  }

  function looksLikeContactNoise(token: string): boolean {
    if (/[a-z]/i.test(token) && token.includes(".")) return true;
    if (/[a-z]/i.test(token) && /\d/.test(token)) return true;
    return false;
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

  function normalizePhrase(phrase: string): string {
    return phrase
      .replace(/[•*]/g, " ")
      .replace(/[()״"“”.-]/g, " ")
      .replace(/\s*\/\s*/g, "/")
      .replace(/\s*&\s*/g, " and ")
      .replace(/[,:;]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function phraseTokens(phrase: string): string[] {
    return tokenize(normalizePhrase(phrase));
  }

  function isUsefulPhrase(phrase: string): boolean {
    const normalized = normalizePhrase(phrase);
    if (!normalized || normalized.length < 2) return false;
    if (normalized.length > 60) return false;
    if (/^\d+$/.test(normalized)) return false;
    const tokens = phraseTokens(normalized);
    if (!tokens.length) return false;
    if (tokens.length > 6) return false;
    const usefulTokens = tokens.filter((token) => !HEBREW_GENERIC_TERMS.has(token) && !ENGLISH_GENERIC_TERMS.has(token));
    if (!usefulTokens.length) return false;
    if (usefulTokens.length / tokens.length < 0.5) return false;
    if (tokens.every((token) => HEBREW_GENERIC_TERMS.has(token) || ENGLISH_GENERIC_TERMS.has(token))) return false;
    if (/(מחפשת|נדרשת|לפחות|חובה|ניסיון של)/u.test(normalized)) return false;
    if (tokens.length === 1 && tokens[0].length < 4 && !/[A-Z]/.test(normalized)) return false;
    return true;
  }

  function dedupePhrases(values: string[]): string[] {
    const seen = new Set<string>();
    const output: string[] = [];
    for (const value of values) {
      const variants = value.includes("/")
        ? value.split("/").map((part) => normalizePhrase(part)).filter(Boolean)
        : [value];
      for (const variant of variants) {
        const normalized = normalizePhrase(variant).toLowerCase();
        if (!normalized || seen.has(normalized) || !isUsefulPhrase(variant)) continue;
        seen.add(normalized);
        output.push(normalizePhrase(variant));
      }
    }
    return output;
  }

  function splitClauses(text: string): string[] {
    return text
      .split(/\r?\n|[•*.]/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => line.split(/[;]+/).map((part) => part.trim()).filter(Boolean));
  }

  function collectSlashPhrases(text: string): string[] {
    const matches = text.match(/[\u0590-\u05FFa-zA-Z][^,\n]{0,80}\/[^,\n]{1,80}/g) || [];
    return matches.flatMap((match) =>
      match
        .split("/")
        .map((part) => normalizePhrase(part))
        .filter((part) => !/[.]/.test(part))
        .filter((part) => part.split(/\s+/).length <= 4)
        .filter((part) => !/^ת\s/u.test(part))
        .filter((part) => isUsefulPhrase(part))
    );
  }

  function collectTriggerPhrases(text: string): string[] {
    const triggers = [
      /(?:ניסיון(?: של \d+ שנים?)? ב|ידע(?: וניסיון)? ב|עבודה עם תוכנות|השכלה בתחום|ניסיון בעבודה עם|הובלה של|ניהול של|הבנה של)\s+([^,\n]+)/gu,
      /(?:experience with|experience in|knowledge of|knowledge in|working with|education in|degree in|leadership of|management of)\s+([^,\n]+)/giu,
    ];
    const results: string[] = [];
    for (const pattern of triggers) {
      for (const match of text.matchAll(pattern)) {
        const candidate = normalizePhrase(match[1] || "");
        if (!candidate) continue;
        candidate
          .split(/\s+ו|\s+and\s+|,\s*/i)
          .map((part) => normalizePhrase(part))
          .filter((part) => isUsefulPhrase(part))
          .forEach((part) => results.push(part));
      }
    }
    return results;
  }

  function collectSpecificHebrewRequirementPhrases(text: string): string[] {
    const results: string[] = [];
    const patterns = [
      /הובלה של מחלקת ההנדסה/gu,
      /ניהול עובדים/gu,
      /פיתוח של תהליכים מרכזיים/gu,
      /תהליכי ייצור/gu,
      /ידע טכני/gu,
      /הנדסת מכונות/gu,
      /הנדסת חשמל/gu,
      /תעשייה וניהול/gu,
      /בטיחות/gu,
      /איכות/gu,
      /ציוד/gu,
      /AutoCAD/giu,
      /SolidWorks/giu,
    ];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        results.push(match[0]);
      }
    }
    return results;
  }

  function collectLinePhrases(text: string): string[] {
    const output: string[] = [];
    for (const clause of splitClauses(text)) {
      const normalized = normalizePhrase(clause);
      if (!normalized) continue;
      const parts = normalized
        .split(/,|\s+ו(?=[\u0590-\u05FF])|\s+and\s+/i)
        .map((part) => normalizePhrase(part))
        .filter(Boolean);
      for (const part of parts) {
        const words = part.split(/\s+/).filter(Boolean);
        if (words.length >= 2 && words.length <= 5 && isUsefulPhrase(part)) {
          output.push(part);
        }
      }
    }
    return output;
  }

  function collectTechPatternPhrases(text: string): string[] {
    const output: string[] = [];
    for (const pattern of TECH_PHRASE_PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        output.push(match[0]);
      }
    }
    return output;
  }

  function extractHeuristicRequirementPhrases(text: string): string[] {
    const isHebrew = /[\u0590-\u05FF]/.test(text);
    const combined = isHebrew
      ? [
          ...collectSpecificHebrewRequirementPhrases(text),
          ...collectTechPatternPhrases(text),
          ...collectSlashPhrases(text),
        ]
      : [
          ...collectTechPatternPhrases(text),
          ...collectSlashPhrases(text),
          ...collectTriggerPhrases(text),
          ...collectLinePhrases(text),
        ];
    return dedupePhrases(combined).slice(0, 24);
  }

  async function refineRequirementPhrasesWithAi(jobDescription: string, candidates: string[]): Promise<string[] | null> {
    const token = getHuggingFaceToken();
    if (!token) return null;
    const prompt = [
      "Extract only concrete skills, tools, domains, and requirement phrases from this job description.",
      "Return JSON only with schema: {\"phrases\":[...]}",
      "Exclude generic words and descriptors such as: required, at least, company, broad, high level, חובה, לפחות, מחפשת, נדרשת.",
      "Prefer phrases like 'הנדסת מכונות', 'ניהול עובדים', 'AutoCAD', 'SolidWorks', 'process improvement', 'quality management'.",
      "Keep the source language.",
      `Candidate phrases: ${candidates.join(" | ")}`,
      "Job description:",
      jobDescription.slice(0, 10000),
    ].join("\n");

    for (const model of getHuggingFaceModels()) {
      try {
        const response = await axios.post(
          "https://router.huggingface.co/v1/chat/completions",
          {
            model,
            messages: [
              { role: "system", content: "Return JSON only. No prose." },
              { role: "user", content: prompt },
            ],
            temperature: 0,
            max_tokens: 700,
            stream: false,
            response_format: { type: "json_object" },
          },
          {
            timeout: 30000,
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );
        const parsed = parseAnalysisJson(extractProviderText(response.data));
        if (Array.isArray(parsed?.phrases)) {
          const refined = dedupePhrases(parsed.phrases.map((item: any) => String(item)));
          if (refined.length) return refined.slice(0, 20);
        }
      } catch (error: any) {
        console.warn("Requirement phrase AI refinement failed", model, error.response?.data || error.message);
      }
    }
    return null;
  }

  async function extractRequirementPhrases(jobDescription: string): Promise<string[]> {
    const cacheKey = crypto.createHash("sha1").update(normalizedForCache(jobDescription)).digest("hex");
    const cached = requirementPhraseCache.get(cacheKey);
    if (cached) return cached;

    const heuristic = extractHeuristicRequirementPhrases(jobDescription);
    const isHebrew = /[\u0590-\u05FF]/.test(jobDescription);
    const refined = isHebrew ? null : await refineRequirementPhrasesWithAi(jobDescription, heuristic);
    const finalPhrases = dedupePhrases(refined && refined.length ? refined : heuristic).slice(0, 18);
    requirementPhraseCache.set(cacheKey, finalPhrases);
    return finalPhrases;
  }

  function resumeHasPhraseEvidence(resumeText: string, phrase: string): boolean {
    const normalizedResume = normalizedForCache(resumeText);
    const normalizedPhrase = normalizedForCache(phrase);
    if (normalizedResume.includes(normalizedPhrase)) return true;
    const phraseWords = phraseTokens(phrase);
    if (!phraseWords.length) return false;
    return phraseWords.every((word) => normalizedResume.includes(word));
  }

  function queryFirstText($: cheerio.CheerioAPI, selectors: string[]): string {
    for (const selector of selectors) {
      const text = $(selector).first().text().replace(/\s+/g, " ").trim();
      if (text) return text;
    }
    return "";
  }

  function htmlFragmentToText(html: string): string {
    const $ = cheerio.load(`<div id="root">${html}</div>`);
    $("#root br").replaceWith("\n");
    $("#root li").each((_, el) => {
      $(el).prepend("• ");
      $(el).append("\n");
    });
    $("#root p, #root h1, #root h2, #root h3, #root h4, #root h5, #root h6, #root div, #root section, #root ul").each((_, el) => {
      $(el).append("\n");
    });
    return $("#root")
      .text()
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function cleanLinkedInJobDescriptionText(text: string): string {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const output: string[] = [];
    for (const line of lines) {
      if (
        /^additional information/i.test(line) ||
        /equal opportunity employer/i.test(line) ||
        /^we expect all employees/i.test(line) ||
        /^our total rewards/i.test(line) ||
        /^the job is open to/i.test(line) ||
        /^relocation assistance provided/i.test(line) ||
        /is a leading global .* innovator/i.test(line)
      ) {
        break;
      }
      output.push(line);
    }

    return output.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
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

  function cleanScrapedJobText(rawText: string, sourceUrl: string): string {
    const isLinkedIn = /linkedin\.com/i.test(sourceUrl);
    const lines = rawText
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const filtered = lines.filter((line) => {
      if (line.length < 2) return false;
      if (JOB_PAGE_BOILERPLATE_PATTERNS.some((pattern) => pattern.test(line))) return false;
      if (isLinkedIn && /^(linkedin|join|sign|policy|privacy|cookie|cookies)$/i.test(line)) return false;
      return true;
    });

    const deduped = uniqueOrdered(filtered);
    return deduped.join("\n").slice(0, 30000).trim();
  }

  function extractLinkedInPostBody(rawText: string): string {
    const lines = rawText
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const contentStart = lines.findIndex((line) =>
      /דרוש|דרושה|דרושים|דרוש\/ה|משרה|vacancy|we are hiring|looking for|job description|position|role/i.test(line),
    );

    const startIndex = contentStart >= 0 ? contentStart : 0;
    const captured: string[] = [];

    for (let i = startIndex; i < lines.length; i += 1) {
      const line = lines[i];
      if (JOB_PAGE_BOILERPLATE_PATTERNS.some((pattern) => pattern.test(line))) continue;
      if (LINKEDIN_POST_STOP_PATTERNS.some((pattern) => pattern.test(line))) break;
      if (/^oksana glazman/i.test(line)) continue;
      if (/head hunter/i.test(line)) continue;
      if (/^\d[\d,]*$/.test(line)) continue;
      if (line.length < 2) continue;
      captured.push(line);
    }

    const trimmed = uniqueOrdered(captured)
      .filter((line) => !/^(linkedin|join|sign|privacy|cookie|policy|followers|posts)$/i.test(line))
      .join("\n")
      .trim();

    return trimmed;
  }

  function extractLinkedInJobBody(rawText: string): string {
    const normalizedRawText = rawText
      .replace(
        /(Job Description Summary|Job Description|Role Summary|Responsibilities|Minimum Qualifications|Qualifications(?: & Experience)?|Skills & Capabilities|Quality-Specific Goals|Additional Information|Supplier & Cross-Functional Collaboration|System Integration & Testing Support|Assembly Process Development & Optimization|Quality & Problem Solving|EHS & Plant Compliance|NPI Leadership for PET & SPECT Imaging Systems)/g,
        "\n$1",
      )
      .replace(/(GE HealthCare is a leading global medical technology[\s\S]*)/i, "\n$1");

    const lines = normalizedRawText
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const contentStart = lines.findIndex((line) => LINKEDIN_JOB_START_PATTERNS.some((pattern) => pattern.test(line)));
    const startIndex = contentStart >= 0 ? contentStart : 0;
    const captured: string[] = [];

    for (let i = startIndex; i < lines.length; i += 1) {
      const line = lines[i];
      if (JOB_PAGE_BOILERPLATE_PATTERNS.some((pattern) => pattern.test(line))) continue;
      if (LINKEDIN_JOB_STOP_PATTERNS.some((pattern) => pattern.test(line))) break;
      if (/^apply$/i.test(line)) continue;
      if (/^easy apply$/i.test(line)) continue;
      if (/^posted/i.test(line)) continue;
      if (/^reposted/i.test(line)) continue;
      if (/^\d[\d,]*\s+reposted$/i.test(line)) continue;
      if (/^\d[\d,]*\s+followers$/i.test(line)) continue;
      if (/^(mid-senior level|full-time|part-time|contract|internship)$/i.test(line)) continue;
      if (/^ge healthcare$/i.test(line)) continue;
      if (/^(haifa|tel aviv|jerusalem|israel)(,.*)?$/i.test(line)) continue;
      if (/^tal robins$/i.test(line)) continue;
      if (/lead recruiting/i.test(line)) continue;
      if (/^use ai to assess how you fit$/i.test(line)) continue;
      if (/^get ai-powered advice on this job/i.test(line)) continue;
      if (/^am i a good fit for this job\?$/i.test(line)) continue;
      if (/^tailor my resume$/i.test(line)) continue;
      if (/^set alert$/i.test(line)) continue;
      if (line.length < 2) continue;
      captured.push(line);
    }

    const trimmed = uniqueOrdered(captured)
      .filter((line) => !/^(linkedin|join|sign|privacy|cookie|policy|followers|posts|apply|save|report)$/i.test(line))
      .join("\n")
      .trim();

    return trimmed || cleanScrapedJobText(rawText, "https://www.linkedin.com/jobs/view/");
  }

  function extractLinkedInJobFromHtml($: cheerio.CheerioAPI) {
    const title = queryFirstText($, LINKEDIN_JOB_TITLE_SELECTORS);
    const company = queryFirstText($, LINKEDIN_JOB_COMPANY_SELECTORS);
    const location = queryFirstText($, LINKEDIN_JOB_LOCATION_SELECTORS);

    let descriptionHtml = "";
    for (const selector of LINKEDIN_JOB_DESCRIPTION_SELECTORS) {
      const html = $(selector).first().html();
      if (html && html.trim()) {
        descriptionHtml = html;
        break;
      }
    }

    const description = descriptionHtml ? cleanLinkedInJobDescriptionText(htmlFragmentToText(descriptionHtml)) : "";
    const pieces = [title, company, location, description].filter(Boolean);
    const structured = uniqueOrdered(pieces).join("\n\n").trim();
    return {
      title,
      company,
      location,
      description,
      structured,
    };
  }

  async function buildDeterministicAnalysis(resumeText: string, jobDescription: string) {
    const jdKeywords = await extractRequirementPhrases(jobDescription);
    const matchedKeywords = jdKeywords.filter((keyword) => resumeHasPhraseEvidence(resumeText, keyword));
    const missingKeywords = jdKeywords.filter((keyword) => !resumeHasPhraseEvidence(resumeText, keyword));
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

  async function refineScrapedJobTextWithAi(sourceUrl: string, rawText: string) {
    const token = getHuggingFaceToken();
    if (!token) return null;

    const prompt = [
      "You extract the real job description from noisy scraped web text.",
      "Return only valid JSON with this exact schema:",
      '{"title":"","company":"","location":"","job_description":""}',
      "Rules:",
      "- Keep only the real job posting.",
      "- Remove LinkedIn chrome, recruiter names, followers, similar jobs, people also viewed, sign-in prompts, footer, marketing, company boilerplate, and unrelated numbers.",
      "- Preserve the original language.",
      "- job_description must contain only the actual role description, responsibilities, requirements, and relevant benefits if they belong to the posting.",
      "- If title/company/location are visible, extract them.",
      `URL: ${sourceUrl}`,
      "TEXT:",
      rawText.slice(0, 12000),
    ].join("\n");

    for (const model of getHuggingFaceModels()) {
      try {
        const response = await axios.post(
          "https://router.huggingface.co/v1/chat/completions",
          {
            model,
            messages: [
              { role: "system", content: "Return JSON only. Do not explain." },
              { role: "user", content: prompt },
            ],
            temperature: 0,
            max_tokens: 1200,
            stream: false,
            response_format: { type: "json_object" },
          },
          {
            timeout: 45000,
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        const parsed = parseAnalysisJson(extractProviderText(response.data));
        const title = typeof parsed?.title === "string" ? parsed.title.trim() : "";
        const company = typeof parsed?.company === "string" ? parsed.company.trim() : "";
        const location = typeof parsed?.location === "string" ? parsed.location.trim() : "";
        const jobDescription = typeof parsed?.job_description === "string" ? parsed.job_description.trim() : "";
        const merged = [title, company, location, jobDescription].filter(Boolean).join("\n\n").trim();
        if (jobDescription.length > 120) {
          return merged;
        }
      } catch (error: any) {
        console.warn("AI JD refinement failed", model, error.response?.data || error.message);
      }
    }

    return null;
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
    const deterministic = await buildDeterministicAnalysis(resumeText, jobDescription);
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
    const deterministic = await buildDeterministicAnalysis(resumeText, jobDescription);
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

      $("script, style, noscript, header, footer, nav, form").remove();

      const candidateSelectors = [
        "main",
        "article",
        "[data-test-id='job-details']",
        ".jobs-description",
        ".description__text .show-more-less-html__markup",
        ".description__text--rich .show-more-less-html__markup",
        ".show-more-less-html__markup",
        ".description__text",
        ".jobs-box__html-content",
        "body",
      ];

      let rawText = "";
      for (const selector of candidateSelectors) {
        const selected = $(selector).text().replace(/\t+/g, " ").replace(/\u00a0/g, " ").trim();
        if (selected.length > rawText.length) rawText = selected;
      }

      let text = "";
      if (/linkedin\.com\/(?:posts|feed\/update|activity)/i.test(url)) {
        text = extractLinkedInPostBody(rawText);
      } else if (/linkedin\.com\/jobs\/view/i.test(url)) {
        const structured = extractLinkedInJobFromHtml($);
        text = structured.structured || extractLinkedInJobBody(rawText);
        const aiRefined = await refineScrapedJobTextWithAi(url, text);
        if (aiRefined) text = aiRefined;
      } else {
        text = cleanScrapedJobText(rawText, url);
      }

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

    const deterministic = await buildDeterministicAnalysis(resumeText, jobDescription);

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

    const deterministic = await buildDeterministicAnalysis(resumeText, jobDescription);
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
