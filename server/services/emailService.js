import nodemailer from "nodemailer";

let cachedTransporter = null;

export function isConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

export function senderAddress() {
  return process.env.GMAIL_USER || "";
}

export function getTransporter() {
  if (!isConfigured()) {
    throw new Error(
      "Gmail is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in your .env file.",
    );
  }
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, ""),
      },
    });
  }
  return cachedTransporter;
}

export function resetTransporter() {
  cachedTransporter = null;
}

/** Maps raw SMTP errors to safe, user-friendly messages (never leaks credentials). */
export function friendlyError(error) {
  const code = error?.code || "";
  const message = String(error?.message || "Unknown email error");
  if (code === "EAUTH" || /invalid login|username and password not accepted/i.test(message)) {
    return "Gmail authentication failed. Check GMAIL_USER and that GMAIL_APP_PASSWORD is a valid 16-character App Password.";
  }
  if (code === "ENOTFOUND" || code === "ECONNREFUSED" || code === "ETIMEDOUT") {
    return "Could not reach smtp.gmail.com. Check your network connection or firewall.";
  }
  if (/no recipients|invalid recipient|550/i.test(message)) {
    return "The recipient address was rejected by the mail server.";
  }
  return message.replace(process.env.GMAIL_APP_PASSWORD || "@@none@@", "***");
}

export async function verifyEmailConnection() {
  try {
    await getTransporter().verify();
    return { ok: true, sender: senderAddress(), message: "Gmail connection successful" };
  } catch (error) {
    return { ok: false, sender: senderAddress(), message: friendlyError(error) };
  }
}

export async function sendEmail({ to, subject, text }) {
  if (!to) throw new Error("Missing recipient address");
  const info = await getTransporter().sendMail({
    from: `"ABC Recruitment" <${senderAddress()}>`,
    to,
    subject,
    text,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1f2933;white-space:pre-wrap">${escapeHtml(
      text,
    )}</div>`,
  });
  return { messageId: info.messageId };
}

/** Sequential bulk send with a small delay so Gmail does not rate-limit. */
export async function sendBulkEmails(messages, { delayMs = 400, onResult } = {}) {
  const results = [];
  for (const message of messages) {
    try {
      const info = await sendEmail(message);
      const result = { ...message, ok: true, messageId: info.messageId };
      results.push(result);
      onResult?.(result);
    } catch (error) {
      const result = { ...message, ok: false, error: friendlyError(error) };
      results.push(result);
      onResult?.(result);
    }
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }
  return results;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
