export const SUPPORTED_VARIABLES = [
  "first_name",
  "last_name",
  "candidate_id",
  "joining_date",
  "location",
  "verification_link",
  "email",
  "phone",
  "department",
  "role",
];

export function candidateVariables(candidate) {
  return {
    first_name: candidate.first_name ?? "",
    last_name: candidate.last_name ?? "",
    candidate_id: candidate.candidate_id ?? "",
    joining_date: formatDate(candidate.joining_date),
    location: candidate.location ?? "",
    verification_link: candidate.verification_link ?? "",
    email: candidate.email ?? "",
    phone: candidate.phone ?? "",
    department: candidate.department ?? "",
    role: candidate.role ?? "",
  };
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Replaces {{variable}} tokens. Missing values become an empty string and are reported. */
export function render(text, vars) {
  const missing = new Set();
  const out = String(text ?? "").replace(/{{\s*([\w.]+)\s*}}/g, (_m, key) => {
    const value = vars[key];
    if (value === undefined || value === null || value === "") {
      missing.add(key);
      return "";
    }
    return String(value);
  });
  return { text: out, missing: [...missing] };
}

/** Returns the list of unsupported {{variable}} tokens found in the given text, if any. */
export function findUnsupportedVariables(text) {
  const unsupported = new Set();
  String(text ?? "").replace(/{{\s*([\w.]+)\s*}}/g, (_m, key) => {
    if (!SUPPORTED_VARIABLES.includes(key)) unsupported.add(key);
    return _m;
  });
  return [...unsupported];
}

/** Throws with a clear message if `subject` or `body` reference an unsupported variable. */
export function validateTemplateVariables(subject, body) {
  const unsupported = [...findUnsupportedVariables(subject), ...findUnsupportedVariables(body)];
  if (unsupported.length) {
    throw new Error(`Unsupported template variable: {{${unsupported[0]}}}`);
  }
}

export function renderEmail(template, candidate) {
  const vars = candidateVariables(candidate);
  const subject = render(template.subject, vars);
  const body = render(template.body, vars);
  return {
    subject: subject.text,
    body: body.text,
    missingVariables: [...new Set([...subject.missing, ...body.missing])],
  };
}
