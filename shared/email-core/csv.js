import Papa from "papaparse";
import * as XLSX from "xlsx";

const HEADER_ALIASES = {
  candidate_id: ["candidate id", "candidateid", "candidate_id", "id", "employee id"],
  first_name: ["first name", "firstname", "first_name"],
  last_name: ["last name", "lastname", "last_name"],
  email: ["email", "email address", "e-mail"],
  phone: ["phone", "mobile", "contact"],
  department: ["department", "dept"],
  role: ["role", "designation", "title"],
  joining_date: ["joining date", "joiningdate", "joining_date", "doj", "date of joining"],
  location: ["location", "city", "base location"],
  verification_link: ["verification link", "verification_link", "verificationlink", "link"],
  education: ["education"],
  highest_qualification: ["highest qualification", "highest_qualification", "qualification"],
  mca: ["mca"],
  graduation: ["graduation"],
  previous_employer: ["previous employer", "previous_employer", "employer"],
  experience: ["experience", "experience (years)", "years of experience"],
};

function normalizeKey(key) {
  const clean = String(key ?? "")
    .trim()
    .toLowerCase();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(clean)) return field;
  }
  return clean.replace(/\s+/g, "_");
}

/** Splits a single combined name column into first_name/last_name when no separate columns were provided. */
function splitCombinedName(row) {
  if (row.first_name) return row;
  const combined = row.name || row.full_name || row.candidate_name;
  if (combined && String(combined).trim()) {
    const [first, ...rest] = String(combined).trim().split(/\s+/);
    row.first_name = first;
    row.last_name = rest.join(" ");
  }
  return row;
}

function normalizeRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[normalizeKey(key)] = typeof value === "string" ? value.trim() : value;
  }
  return splitCombinedName(out);
}

/** Accepts a Node Buffer, ArrayBuffer/Uint8Array (browser) or raw text. */
export function parseUpload(buffer, filename = "") {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
    const wb = XLSX.read(bytes, { type: "array", cellDates: true });
    const sheetName = wb.SheetNames[0];
    const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }).map(normalizeRow);
  }
  const text =
    typeof buffer === "string"
      ? buffer
      : typeof Buffer !== "undefined" && Buffer.isBuffer(buffer)
        ? buffer.toString("utf8")
        : new TextDecoder("utf-8").decode(
            buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer,
          );
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  });
  return parsed.data.map(normalizeRow);
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Validates parsed rows. Returns valid rows plus an issue list
 * (one row can produce several issues).
 */
export function validateRows(rows, existingEmails = []) {
  const issues = [];
  const seenEmails = new Set(existingEmails.map((e) => String(e).toLowerCase()));
  const seenInFile = new Set();
  const valid = [];
  let duplicates = 0;

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // header is row 1
    const rowIssues = [];
    const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();

    if (!row.candidate_id) rowIssues.push({ issue: "Missing candidate ID", severity: "ERROR" });
    if (!row.first_name) rowIssues.push({ issue: "Missing candidate name", severity: "ERROR" });
    if (!row.email) rowIssues.push({ issue: "Missing email address", severity: "ERROR" });
    else if (!EMAIL_RE.test(row.email))
      rowIssues.push({ issue: "Invalid email format", severity: "ERROR" });
    if (!row.verification_link)
      rowIssues.push({ issue: "Missing verification link", severity: "WARNING" });
    if (!row.joining_date) rowIssues.push({ issue: "Missing joining date", severity: "WARNING" });

    const emailKey = String(row.email ?? "").toLowerCase();
    let duplicate = false;
    if (emailKey && seenInFile.has(emailKey)) {
      // Same address twice inside the uploaded file — cannot import both.
      duplicate = true;
      duplicates += 1;
      rowIssues.push({ issue: "Duplicate email address in this file", severity: "ERROR" });
    } else if (emailKey && seenEmails.has(emailKey)) {
      // Address already exists in a previous batch — importable, but flagged.
      duplicates += 1;
      rowIssues.push({ issue: "Email already exists in another batch", severity: "WARNING" });
    }
    if (emailKey) seenInFile.add(emailKey);

    for (const item of rowIssues) {
      issues.push({
        row: rowNumber,
        candidate: name || row.candidate_id || `Row ${rowNumber}`,
        email: row.email || "—",
        ...item,
      });
    }

    const hasError = rowIssues.some((i) => i.severity === "ERROR");
    if (!hasError && !duplicate) valid.push(row);
  });

  return {
    total: rows.length,
    validCount: valid.length,
    invalidCount: rows.length - valid.length,
    duplicateCount: duplicates,
    valid,
    issues,
  };
}
