export declare const EMAIL_RE: RegExp;

export declare function normalizeIndianPhone(raw: string): string | null;

export declare const HEADER_ALIASES: Record<string, string>;

export declare function normalizeHeaderKey(raw: string): string;

export declare function resolveHeader(raw: string): string;

export declare function parseDelimited(text: string): Array<Record<string, string>>;

export interface CsvAnalysis {
  valid: Array<Record<string, string>>;
  duplicates: number;
  missingEmail: number;
  invalidPhone: number;
}

export declare function analyseRows(rows: Array<Record<string, string>>): CsvAnalysis;
