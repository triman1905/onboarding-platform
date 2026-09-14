/**
 * CSV parsing/validation for the "Create Batch" importer (src/routes/batches.new.tsx).
 *
 * Plain JS (mirrors the shared/email-core/csv.js + .d.ts pattern already used
 * in this project) so the exact same logic used by the component can also be
 * exercised directly by a test runner with no build step.
 */

// Same email regex the real backend importer uses (shared/email-core/csv.js).
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const E164_RE = /^\+[1-9]\d{7,14}$/;
const IN_MOBILE_RE = /^[6-9]\d{9}$/;

/**
 * Same Indian-number → E.164 normalization the real candidate model uses
 * (server/services/communication/phoneNumber.js). Accepts a bare 10-digit
 * mobile number, one with a leading 0, or one already carrying a +91/91/091
 * country code; returns null (never guesses) for anything else.
 */
export function normalizeIndianPhone(raw) {
  if (!raw) return null;
  let value = String(raw).trim();
  if (!value) return null;
  value = value.replace(/[\s\-().]/g, "");

  if (value.startsWith("00")) value = `+${value.slice(2)}`;
  if (value.startsWith("+")) return E164_RE.test(value) ? value : null;

  const digits = value.replace(/\D/g, "");
  if (!digits) return null;

  if (IN_MOBILE_RE.test(digits)) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0") && IN_MOBILE_RE.test(digits.slice(1))) {
    return `+91${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith("91") && IN_MOBILE_RE.test(digits.slice(2))) {
    return `+${digits}`;
  }
  if (digits.length === 13 && digits.startsWith("091") && IN_MOBILE_RE.test(digits.slice(3))) {
    return `+91${digits.slice(3)}`;
  }
  return null;
}

/**
 * Canonical field aliases for the Create Batch CSV importer. Each raw header
 * is normalized (trim → lowercase → spaces/hyphens → underscore) and looked
 * up here; an unrecognized header is kept as-is so unrelated columns still
 * pass through untouched.
 */
export const HEADER_ALIASES = {
  // Candidate ID
  candidate_id: "Candidate ID",
  candidateid: "Candidate ID",
  id: "Candidate ID",
  // Name
  name: "Name",
  candidate_name: "Name",
  // Email
  email: "Email",
  email_address: "Email",
  emailaddress: "Email",
  email_id: "Email",
  // Phone
  phone: "Phone",
  phone_number: "Phone",
  phonenumber: "Phone",
  mobile: "Phone",
  mobile_number: "Phone",
  // Batch
  batch: "Batch",
  batch_name: "Batch",
  // MCA
  mca: "MCA",
};

export function normalizeHeaderKey(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function resolveHeader(raw) {
  const trimmed = raw.trim().replace(/^"|"$/g, "");
  return HEADER_ALIASES[normalizeHeaderKey(trimmed)] ?? trimmed;
}

/** Naive comma-split parser (pre-existing limitation: no quoted-comma support) — unchanged from before this fix. */
export function parseDelimited(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(resolveHeader);
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const row = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

/**
 * Validates already-header-resolved rows: duplicate Candidate ID, email
 * format, and Indian phone format/normalization. Also derives First/Last
 * Name from a single "Name" column when present, since batch creation
 * (useVanguard.createBatch) reads "First Name"/"Last Name".
 */
export function analyseRows(rows) {
  const seen = new Set();
  let duplicates = 0;
  let missingEmail = 0;
  let invalidPhone = 0;
  const valid = [];

  for (const r of rows) {
    const id = r["Candidate ID"] ?? "";
    const email = r["Email"] ?? "";
    const phone = r["Phone"] ?? "";
    const normalizedPhone = normalizeIndianPhone(phone);
    let ok = true;

    if (seen.has(id) && id) {
      duplicates++;
      ok = false;
    }
    seen.add(id);

    if (!EMAIL_RE.test(email)) {
      missingEmail++;
      ok = false;
    }
    if (!normalizedPhone) {
      invalidPhone++;
      ok = false;
    }

    if (ok) {
      const patch = { Phone: normalizedPhone };
      if (r["Name"] && !r["First Name"] && !r["Last Name"]) {
        const [first, ...rest] = r["Name"].trim().split(/\s+/);
        patch["First Name"] = first ?? r["Name"];
        patch["Last Name"] = rest.join(" ");
      }
      valid.push({ ...r, ...patch });
    }
  }

  return { valid, duplicates, missingEmail, invalidPhone };
}
