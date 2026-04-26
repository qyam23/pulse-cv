import { detectTextLanguage, languageCompatible, type TextLanguage } from "../analysis/language";

type MetaCategory =
  | "conditional_intro"
  | "advice_verb"
  | "instruction_verb"
  | "recommendation_marker"
  | "review_marker"
  | "missing_evidence_marker"
  | "model_reasoning_marker"
  | "ui_label";

type PatternEntry = {
  category: MetaCategory;
  pattern: RegExp;
};

export type MetaLanguageGuardResult = {
  safe: boolean;
  detectedLanguage: TextLanguage;
  categories: MetaCategory[];
  violations: string[];
};

const STRUCTURAL_PATTERNS: PatternEntry[] = [
  { category: "conditional_intro", pattern: /^(if|when|provided that|assuming)\b/i },
  { category: "conditional_intro", pattern: /^(אם|במידה|כאשר)\b/u },
  { category: "conditional_intro", pattern: /^(si|cuando)\b/i },
  { category: "conditional_intro", pattern: /^(si|lorsque|quand)\b/i },
  { category: "conditional_intro", pattern: /^(falls|wenn)\b/i },
  { category: "conditional_intro", pattern: /^(если|когда)\b/i },
  { category: "advice_verb", pattern: /\b(consider|improve|strengthen|tailor|clarify|highlight)\b/i },
  { category: "advice_verb", pattern: /\b(שפר|חזק|כדאי|הדגש|הבהר|עדכן)\b/u },
  { category: "advice_verb", pattern: /\b(mejore|refuerce|aclare|resalte|actualice)\b/i },
  { category: "advice_verb", pattern: /\b(améliorez|renforcez|mettez en avant)\b/i },
  { category: "advice_verb", pattern: /\b(verbessern sie|stärken sie|hervorheben)\b/i },
  { category: "advice_verb", pattern: /\b(улучшите|усильте|подчеркните)\b/i },
  { category: "instruction_verb", pattern: /\b(add|insert|rewrite|use wording|replace with)\b/i },
  { category: "instruction_verb", pattern: /\b(הוסף|להוסיף|נסח|שכתב|החלף)\b/u },
  { category: "instruction_verb", pattern: /\b(agregue|añada|reescriba|reemplace)\b/i },
  { category: "instruction_verb", pattern: /\b(ajoutez|réécrivez|remplacez)\b/i },
  { category: "instruction_verb", pattern: /\b(fügen sie hinzu|umschreiben|ersetzen sie)\b/i },
  { category: "instruction_verb", pattern: /\b(добавьте|перепишите|замените)\b/i },
];

const META_LANGUAGE_PATTERNS: Record<string, PatternEntry[]> = {
  en: [
    { category: "recommendation_marker", pattern: /\b(recommendation|recommended|suggested|suggestion)\b/i },
    { category: "review_marker", pattern: /\b(manual review|required review|needs review)\b/i },
    { category: "missing_evidence_marker", pattern: /\b(no evidence found|no direct proof|gap in proof)\b/i },
    { category: "model_reasoning_marker", pattern: /\b(if accurate|if relevant|if applicable|the candidate should|the cv should)\b/i },
    { category: "ui_label", pattern: /\b(apply recommendations|evidence map|candidate recommendations|high confidence fit)\b/i },
  ],
  he: [
    { category: "recommendation_marker", pattern: /(מומלץ|המלצה|המלצות)/u },
    { category: "review_marker", pattern: /(נדרשת בדיקה|בדיקה ידנית|דורש בדיקה)/u },
    { category: "missing_evidence_marker", pattern: /(לא נמצאה ראיה|פער ניסוח|יש לוודא|יש לבדוק)/u },
    { category: "model_reasoning_marker", pattern: /(אם זה נכון|אם רלוונטי|אם קיים|אם קיימת|המועמד צריך|קורות החיים צריכים)/u },
    { category: "ui_label", pattern: /(מפת ראיות|המלצות למועמד|הגש בקשה|בדיקה לפני הגשה)/u },
  ],
  es: [
    { category: "recommendation_marker", pattern: /\b(recomendación|recomendado|sugerido)\b/i },
    { category: "review_marker", pattern: /\b(requiere revisión|revisión manual)\b/i },
    { category: "missing_evidence_marker", pattern: /\b(no se encontró evidencia|sin prueba directa)\b/i },
    { category: "model_reasoning_marker", pattern: /\b(si es cierto|si aplica|si corresponde|el candidato debe|el cv debe)\b/i },
    { category: "ui_label", pattern: /\b(mapa de evidencia|recomendaciones del candidato)\b/i },
  ],
  fr: [
    { category: "recommendation_marker", pattern: /\b(recommandation|recommandé|suggéré)\b/i },
    { category: "review_marker", pattern: /\b(révision manuelle|nécessite une révision)\b/i },
    { category: "missing_evidence_marker", pattern: /\b(aucune preuve trouvée|aucune preuve directe)\b/i },
    { category: "model_reasoning_marker", pattern: /\b(si c'est vrai|si applicable|le candidat doit|le cv doit)\b/i },
    { category: "ui_label", pattern: /\b(carte des preuves|recommandations du candidat)\b/i },
  ],
  de: [
    { category: "recommendation_marker", pattern: /\b(empfehlung|empfohlen|vorgeschlagen)\b/i },
    { category: "review_marker", pattern: /\b(prüfung erforderlich|manuelle prüfung)\b/i },
    { category: "missing_evidence_marker", pattern: /\b(keine nachweise gefunden|kein direkter nachweis)\b/i },
    { category: "model_reasoning_marker", pattern: /\b(falls zutreffend|wenn relevant|der kandidat sollte|der lebenslauf sollte)\b/i },
    { category: "ui_label", pattern: /\b(evidence map|kandidatenempfehlungen)\b/i },
  ],
  ru: [
    { category: "recommendation_marker", pattern: /\b(рекомендация|рекомендуется)\b/i },
    { category: "review_marker", pattern: /\b(требуется проверка|ручная проверка)\b/i },
    { category: "missing_evidence_marker", pattern: /\b(не найдено доказательств|нет прямого подтверждения)\b/i },
    { category: "model_reasoning_marker", pattern: /\b(если это верно|если применимо|кандидат должен|резюме должно)\b/i },
    { category: "ui_label", pattern: /\b(карта доказательств|рекомендации кандидату)\b/i },
  ],
};

function cleanWhitespace(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collectPatternViolations(text: string, patterns: PatternEntry[], violations: string[], categories: Set<MetaCategory>) {
  for (const entry of patterns) {
    if (entry.pattern.test(text)) {
      categories.add(entry.category);
      violations.push(entry.pattern.source);
    }
  }
}

function languagePacks(language: TextLanguage): PatternEntry[] {
  if (language === "he") return META_LANGUAGE_PATTERNS.he;
  if (language === "en") return META_LANGUAGE_PATTERNS.en;
  if (language === "mixed") return [
    ...META_LANGUAGE_PATTERNS.he,
    ...META_LANGUAGE_PATTERNS.en,
    ...META_LANGUAGE_PATTERNS.es,
    ...META_LANGUAGE_PATTERNS.fr,
    ...META_LANGUAGE_PATTERNS.de,
    ...META_LANGUAGE_PATTERNS.ru,
  ];
  return [
    ...META_LANGUAGE_PATTERNS.en,
    ...META_LANGUAGE_PATTERNS.he,
    ...META_LANGUAGE_PATTERNS.es,
    ...META_LANGUAGE_PATTERNS.fr,
    ...META_LANGUAGE_PATTERNS.de,
    ...META_LANGUAGE_PATTERNS.ru,
  ];
}

export function analyzeMetaLanguage(text: string, expectedLanguage: TextLanguage = "unknown"): MetaLanguageGuardResult {
  const normalized = cleanWhitespace(text);
  const detectedLanguage = detectTextLanguage(normalized).language;
  const categories = new Set<MetaCategory>();
  const violations: string[] = [];

  if (!normalized) {
    categories.add("missing_evidence_marker");
    violations.push("empty_text");
  }

  collectPatternViolations(normalized, STRUCTURAL_PATTERNS, violations, categories);
  collectPatternViolations(normalized, languagePacks(expectedLanguage), violations, categories);

  if (expectedLanguage !== "unknown" && expectedLanguage !== "mixed" && !languageCompatible(expectedLanguage, normalized)) {
    categories.add("model_reasoning_marker");
    violations.push("language_mismatch");
  }

  return {
    safe: violations.length === 0,
    detectedLanguage,
    categories: Array.from(categories),
    violations: Array.from(new Set(violations)),
  };
}

export function sanitizeDisplayText(value: string): { text: string; warnings: string[]; rejected: boolean } {
  const normalized = cleanWhitespace(value);
  if (!normalized) return { text: "", warnings: [], rejected: true };

  const warnings: string[] = [];
  const keptLines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const result = analyzeMetaLanguage(line, "unknown");
      if (!result.safe) {
        warnings.push(`Removed meta line: ${line}`);
      }
      return result.safe;
    });

  const text = cleanWhitespace(keptLines.join("\n"));
  return { text, warnings, rejected: !text };
}

export function validateFinalCvSentence(text: string, expectedLanguage: TextLanguage): MetaLanguageGuardResult {
  return analyzeMetaLanguage(text, expectedLanguage);
}
