export function normalizeWhitespace(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeText(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/[–—]/g, "-");
}

export function slugify(value: string): string {
  return normalizeText(value)
    .replace(/[^a-z0-9\u0590-\u05FF]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function stripHebrewPrefixes(token: string): string {
  const prefixes = ["ו", "ב", "ל", "כ", "מ", "ש", "ה"];
  let output = token;
  while (output.length > 4 && prefixes.includes(output[0])) {
    output = output.slice(1);
  }
  return output;
}

export function normalizeToken(token: string): string {
  const cleaned = normalizeText(token).replace(/^[^a-z0-9\u0590-\u05FF]+|[^a-z0-9\u0590-\u05FF]+$/g, "");
  if (/^[\u0590-\u05FF]+$/u.test(cleaned)) {
    return stripHebrewPrefixes(cleaned);
  }
  return cleaned;
}

export function tokenize(value: string): string[] {
  const raw = normalizeText(value).match(/[a-z0-9+#.]{2,}|[\u0590-\u05FF]{2,}/g) || [];
  return raw.map(normalizeToken).filter(Boolean);
}

export function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export function lineSpans(text: string): { text: string; start: number; end: number }[] {
  const lines = text.split(/\r?\n/);
  const spans: { text: string; start: number; end: number }[] = [];
  let cursor = 0;
  for (const line of lines) {
    const start = cursor;
    const end = cursor + line.length;
    if (line.trim()) {
      spans.push({ text: line.trim(), start, end });
    }
    cursor = end + 1;
  }
  return spans;
}

export function sentenceSpans(text: string): { text: string; start: number; end: number }[] {
  const pattern = /[^.!?\n]+[.!?]?/g;
  const spans: { text: string; start: number; end: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const value = match[0].trim();
    if (!value) continue;
    spans.push({ text: value, start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

export function includesAlias(text: string, alias: string): boolean {
  const haystack = normalizeText(text);
  const needle = normalizeText(alias);
  if (!needle) return false;
  return haystack.includes(needle);
}

export function overlapRatio(left: string, right: string): number {
  const leftTokens = unique(tokenize(left));
  const rightTokens = unique(tokenize(right));
  if (!leftTokens.length || !rightTokens.length) return 0;
  const intersection = leftTokens.filter((token) => rightTokens.includes(token)).length;
  return intersection / Math.max(rightTokens.length, 1);
}
