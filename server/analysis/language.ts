export type TextLanguage = "he" | "en" | "mixed" | "unknown";

export interface LanguageDetection {
  language: TextLanguage;
  confidence: number;
  hebrewRatio: number;
  latinRatio: number;
}

export function detectTextLanguage(text: string): LanguageDetection {
  const letters = Array.from(text || "").filter((char) => /\p{L}/u.test(char));
  if (!letters.length) {
    return { language: "unknown", confidence: 0.1, hebrewRatio: 0, latinRatio: 0 };
  }

  const hebrew = letters.filter((char) => /[\u0590-\u05FF]/u.test(char)).length;
  const latin = letters.filter((char) => /[A-Za-z]/.test(char)).length;
  const hebrewRatio = hebrew / letters.length;
  const latinRatio = latin / letters.length;

  if (hebrewRatio >= 0.35 && latinRatio >= 0.2) {
    return { language: "mixed", confidence: Math.min(0.88, hebrewRatio + latinRatio), hebrewRatio, latinRatio };
  }
  if (hebrewRatio >= 0.25) {
    return { language: "he", confidence: Math.min(0.98, 0.55 + hebrewRatio), hebrewRatio, latinRatio };
  }
  if (latinRatio >= 0.45) {
    return { language: "en", confidence: Math.min(0.98, 0.5 + latinRatio), hebrewRatio, latinRatio };
  }
  return { language: "unknown", confidence: 0.35, hebrewRatio, latinRatio };
}

export function languageCompatible(target: TextLanguage, value: string): boolean {
  if (!value.trim() || target === "unknown" || target === "mixed") return true;
  const detected = detectTextLanguage(value);
  if (detected.language === "unknown" || detected.language === "mixed") return true;
  return detected.language === target;
}

export function languageLabel(language: TextLanguage): string {
  switch (language) {
    case "he":
      return "Hebrew";
    case "en":
      return "English";
    case "mixed":
      return "Mixed Hebrew/English";
    default:
      return "Unknown";
  }
}
