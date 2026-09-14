export interface CoreCandidate {
  id?: string;
  candidate_id?: string;
  batch_id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  joining_date?: string | null;
  location?: string | null;
  verification_link?: string | null;
  verification_status?: string;
}

export interface CoreTemplate {
  id?: string;
  name?: string;
  subject: string;
  body: string;
}

export interface RenderedEmail {
  subject: string;
  body: string;
  missingVariables: string[];
}

export interface CoreIssue {
  row: number;
  candidate: string;
  email: string;
  issue: string;
  severity: "ERROR" | "WARNING";
}

export interface CoreValidation {
  total: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  valid: Record<string, string>[];
  issues: CoreIssue[];
}
