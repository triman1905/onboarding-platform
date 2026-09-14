/**
 * HOSTED email transport (Lovable-hosted execution environment).
 *
 * Implements the same conceptual EmailService contract as the local
 * Nodemailer provider (server/services/emailService.js):
 *   sendEmail() · sendBulkEmails() · verifyConnection()
 *
 * All calls run server-side only. The Resend key never reaches the browser.
 */
const GATEWAY = "https://connector-gateway.lovable.dev/resend";

export interface SendArgs {
  to: string;
  subject: string;
  text: string;
  from: string;
  fromName?: string;
}

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

function keys() {
  const lovable = process.env["LOVABLE_API_KEY"];
  const resend = process.env["RESEND_API_KEY"];
  if (!lovable || !resend) {
    throw new Error("Hosted email provider is not configured (missing provider credentials).");
  }
  return { lovable, resend };
}

async function gateway(path: string, init: RequestInit = {}) {
  const { lovable, resend } = keys();
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovable}`,
      "X-Connection-Api-Key": resend,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const body = await res.text();
  let parsed: unknown = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    parsed = { message: body };
  }
  return { ok: res.ok, status: res.status, data: parsed as Record<string, unknown> | null };
}

function providerMessage(data: Record<string, unknown> | null, status: number) {
  const nested = (data?.["error"] ?? null) as Record<string, unknown> | string | null;
  const message =
    (typeof nested === "string" ? nested : (nested?.["message"] as string | undefined)) ??
    (data?.["message"] as string | undefined) ??
    (data?.["name"] as string | undefined) ??
    `Provider request failed (${status})`;
  return String(message);
}

export function escapeHtml(value: string) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Sends one email through Resend. Never throws provider credentials. */
export async function sendEmail({ to, subject, text, from, fromName }: SendArgs): Promise<SendResult> {
  if (!to) return { ok: false, error: "Missing recipient address" };
  const { ok, status, data } = await gateway("/emails", {
    method: "POST",
    body: JSON.stringify({
      from: fromName ? `${fromName} <${from}>` : from,
      to: [to],
      subject,
      text,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1f2933;white-space:pre-wrap">${escapeHtml(
        text,
      )}</div>`,
    }),
  });
  if (!ok) {
    console.error(`[resend] send failed [${status}]`, data);
    return { ok: false, error: providerMessage(data, status) };
  }
  return { ok: true, id: (data?.["id"] as string | undefined) ?? "" };
}

/** Sequential bulk send with a small delay, mirroring the local provider. */
export async function sendBulkEmails(messages: SendArgs[], delayMs = 300) {
  const results: (SendResult & { to: string })[] = [];
  for (const message of messages) {
    const result = await sendEmail(message);
    results.push({ ...result, to: message.to });
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }
  return results;
}

export interface VerifyResult {
  ok: boolean;
  message: string;
  senderVerified: boolean;
  verifiedDomains: string[];
}

/**
 * Verifies the provider connection AND whether the configured sender domain is
 * actually verified. We never silently substitute a different sender.
 */
export async function verifyConnection(senderEmail: string): Promise<VerifyResult> {
  let res;
  try {
    res = await gateway("/domains", { method: "GET" });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Provider not configured",
      senderVerified: false,
      verifiedDomains: [],
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      message: providerMessage(res.data, res.status),
      senderVerified: false,
      verifiedDomains: [],
    };
  }
  const list = ((res.data?.["data"] as Array<Record<string, unknown>> | undefined) ?? []).filter(
    (d) => String(d["status"]).toLowerCase() === "verified",
  );
  const verifiedDomains = list.map((d) => String(d["name"]));
  const senderDomain = senderEmail.split("@")[1]?.toLowerCase() ?? "";
  const senderVerified =
    senderEmail.toLowerCase().endsWith("@resend.dev") || verifiedDomains.some((d) => d.toLowerCase() === senderDomain);
  return {
    ok: true,
    message: senderVerified
      ? "Resend connection successful"
      : `Resend connection successful, but ${senderEmail} is not a verified sender.`,
    senderVerified,
    verifiedDomains,
  };
}
