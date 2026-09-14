/**
 * Phone number normalization to E.164, used by both the WhatsApp and SMS
 * channels (they share the candidate's `phone` field — see batchService.js).
 *
 * Scope: this prototype targets Indian test candidates, so the only implicit
 * country-code assumption is +91. Numbers that already carry a country code
 * (a leading '+', or a leading '91'/'091' on a 12/13-digit number) are never
 * re-prefixed. Anything else that isn't unambiguously a 10-digit Indian
 * mobile number returns null rather than guessing.
 */

const E164_RE = /^\+[1-9]\d{7,14}$/;
const IN_MOBILE_RE = /^[6-9]\d{9}$/;

/** Returns an E.164 string (e.g. "+919311838864"), or null if it cannot be normalized safely. */
export function normalizePhone(raw) {
  if (!raw) return null;
  let value = String(raw).trim();
  if (!value) return null;
  value = value.replace(/[\s\-().]/g, "");

  if (value.startsWith("00")) value = `+${value.slice(2)}`;

  if (value.startsWith("+")) {
    return E164_RE.test(value) ? value : null;
  }

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

export function isValidE164(value) {
  return typeof value === "string" && E164_RE.test(value);
}
