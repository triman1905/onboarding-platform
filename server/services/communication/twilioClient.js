import twilio from "twilio";

let cachedClient = null;

/** Master switch: TWILIO_ENABLED=false disables WhatsApp *and* SMS regardless of other flags. */
export function isTwilioConfigured() {
  return (
    process.env.TWILIO_ENABLED !== "false" &&
    Boolean(process.env.TWILIO_ACCOUNT_SID) &&
    Boolean(process.env.TWILIO_AUTH_TOKEN)
  );
}

export function getTwilioClient() {
  if (!isTwilioConfigured()) {
    throw new Error(
      "Twilio is not configured on the backend (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).",
    );
  }
  if (!cachedClient) {
    cachedClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return cachedClient;
}

export function resetTwilioClient() {
  cachedClient = null;
}

/** Maps raw Twilio SDK errors to a safe {code, message} pair. Never leaks the auth token. */
export function friendlyTwilioError(error) {
  const code = error?.code != null ? String(error.code) : null;
  let message = String(error?.message || "Unknown Twilio error");
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (token) message = message.replaceAll(token, "***");
  return { code, message };
}

/** Twilio message.status values -> the app's unified delivery_status vocabulary. */
export function mapTwilioStatus(status) {
  const map = {
    accepted: "QUEUED",
    queued: "QUEUED",
    sending: "QUEUED",
    sent: "SENT",
    delivered: "DELIVERED",
    read: "READ",
    failed: "FAILED",
    undelivered: "FAILED",
  };
  return map[status] || null;
}
