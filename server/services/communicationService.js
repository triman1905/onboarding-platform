import { db, log, uid } from "../db/database.js";
import { getTemplate } from "./templateService.js";
import { renderEmail, candidateVariables } from "../utils/templateRenderer.js";
import { sendEmail, friendlyError, isConfigured, senderAddress } from "./emailService.js";
import { getCandidate } from "./batchService.js";
import {
  getWhatsAppProvider,
  isWhatsAppConfigured,
} from "./communication/providers/whatsappProvider.js";
import { getSmsProvider, isSmsConfigured } from "./communication/providers/smsProvider.js";
import { renderWhatsAppMessage, renderSmsMessage } from "./communication/messageTemplates.js";

const MAX_RETRY_ATTEMPTS = 5;
/** Statuses that mean "this channel already has a live or successful attempt" for dedupe checks. */
const UNSENT_STATUSES = ["FAILED", "SKIPPED"];

/** Reuses the same TEST_MODE flag already surfaced by /api/communications/status — no second setting. */
function isTestMode() {
  return process.env.TEST_MODE !== "false";
}

/**
 * TEST MODE: duplicate protection intentionally bypassed for repeated prototype testing.
 * Production mode must enforce duplicate protection.
 *
 * Scope: WHATSAPP/SMS only. EMAIL's duplicate protection is never bypassed,
 * test mode or not — this function always returns true for "EMAIL" so the
 * existing email skip-if-already-sent behaviour is completely unchanged.
 * Set TEST_MODE=false in server/.env to re-enable duplicate protection for
 * every channel. Exported so reminderService's Review & Send screen can
 * show the same READY/ALREADY_SENT verdict that a send will actually honor.
 */
export function duplicateProtectionActive(channel) {
  if (channel === "EMAIL") return true;
  return !isTestMode();
}

/**
 * `assignedToUserId` is the backend-enforced RBAC scope for a TEAM_MEMBER —
 * it joins against `candidates` so history can never be read for a candidate
 * that isn't theirs, regardless of what `candidateId`/`batchId` the caller
 * passes. Callers must always supply it for a non-MANAGER caller.
 */
export function listCommunications({
  status,
  type,
  batchId,
  candidateId,
  assignedToUserId,
  limit = 500,
} = {}) {
  const clauses = [];
  const params = [];
  if (status) {
    clauses.push("e.status = ?");
    params.push(status);
  }
  if (type) {
    clauses.push("e.type = ?");
    params.push(type);
  }
  if (batchId) {
    clauses.push("e.batch_id = ?");
    params.push(batchId);
  }
  if (candidateId) {
    clauses.push("e.candidate_id = ?");
    params.push(candidateId);
  }
  if (assignedToUserId) {
    clauses.push("c.assigned_to_user_id = ?");
    params.push(assignedToUserId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db
    .prepare(
      `SELECT e.*, c.first_name, c.last_name, c.candidate_id AS candidate_ref,
              COALESCE(e.template_name, t.name) AS template_name, r.execution_mode
       FROM email_communications e
       LEFT JOIN candidates c ON c.id = e.candidate_id
       LEFT JOIN email_templates t ON t.id = e.template_id
       LEFT JOIN reminder_schedules r ON r.id = e.reminder_id
       ${where}
       ORDER BY e.created_at DESC LIMIT ?`,
    )
    .all(...params, limit);
}

/** Candidate-scoped history — always call behind `requireCandidateAccess`. */
export function listCommunicationsForCandidate(candidateId) {
  return listCommunications({ candidateId, limit: 500 });
}

/**
 * A row counts as "already sent" once it has any non-terminal-failure status —
 * WhatsApp/SMS rows may sit at SENT and later flip to DELIVERED/READ via the
 * Twilio status webhook, so checking `status = 'SENT'` alone would under-count
 * and risk a duplicate send.
 */
export function alreadySent(candidateId, templateId, type) {
  return db
    .prepare(
      `SELECT id FROM email_communications WHERE candidate_id = ? AND template_id = ? AND type = ? AND status NOT IN (${UNSENT_STATUSES.map(() => "?").join(",")})`,
    )
    .get(candidateId, templateId, type, ...UNSENT_STATUSES);
}

/** Scoped per reminder schedule AND channel — the dedupe guard for unattended Auto Send. */
export function alreadySentForReminderChannel(candidateId, reminderId, channel) {
  return db
    .prepare(
      `SELECT id FROM email_communications WHERE candidate_id = ? AND reminder_id = ? AND channel = ? AND status NOT IN (${UNSENT_STATUSES.map(() => "?").join(",")})`,
    )
    .get(candidateId, reminderId, channel, ...UNSENT_STATUSES);
}

/**
 * Resolves the EMAIL signature to append for a candidate: their assigned team
 * member's team signature, falling back to the seeded team's signature if the
 * candidate is unassigned. Centralized here so every EMAIL send path (welcome,
 * reminder, preview) appends the same line without hardcoding it per-screen.
 */
export function resolveEmailSignature(candidate) {
  const row = candidate?.assigned_to_user_id
    ? db
        .prepare(
          `SELECT t.signature FROM users u JOIN teams t ON t.id = u.team_id WHERE u.id = ?`,
        )
        .get(candidate.assigned_to_user_id)
    : null;
  if (row?.signature) return row.signature;
  return db.prepare(`SELECT signature FROM teams LIMIT 1`).get()?.signature ?? "";
}

export function appendSignature(body, candidate) {
  const signature = resolveEmailSignature(candidate);
  if (!signature) return body;
  return `${body}\n\n${signature}`;
}

function insertCommunication(row) {
  const id = uid("comm");
  db.prepare(
    `INSERT INTO email_communications (id, candidate_id, batch_id, template_id, template_name, reminder_id, type, channel, provider, recipient, subject, body, status, scheduled_at)
     VALUES (@id, @candidate_id, @batch_id, @template_id, @template_name, @reminder_id, @type, @channel, @provider, @recipient, @subject, @body, @status, @scheduled_at)`,
  ).run({
    id,
    reminder_id: null,
    scheduled_at: null,
    status: "QUEUED",
    channel: "EMAIL",
    provider: "GMAIL",
    ...row,
  });
  return id;
}

/**
 * Sends a template to a list of candidates sequentially.
 * Each candidate gets its own communication record and status.
 */
export async function sendToCandidates({
  candidates,
  templateId,
  type = "WELCOME",
  batchId = null,
  reminderId = null,
  force = false,
  skipPredicate = null,
}) {
  if (!isConfigured()) {
    throw new Error(
      "Gmail is not configured on the backend. Add GMAIL_USER and GMAIL_APP_PASSWORD to server .env.",
    );
  }
  const template = getTemplate(templateId);
  if (!template) throw new Error("Template not found");

  const summary = { attempted: 0, sent: 0, failed: 0, skipped: 0, results: [] };

  for (const candidate of candidates) {
    const skipReason = skipPredicate?.(candidate);
    if (skipReason) {
      summary.skipped += 1;
      summary.results.push({ candidate: candidate.email, status: "SKIPPED", reason: skipReason });
      log(`Skipped ${candidate.email}: ${skipReason}`, { source: "EMAIL" });
      continue;
    }
    if (!force && alreadySent(candidate.id, templateId, type)) {
      summary.skipped += 1;
      summary.results.push({
        candidate: candidate.email,
        status: "SKIPPED",
        reason: "Already sent",
      });
      continue;
    }

    const rendered = renderEmail(template, candidate);
    const bodyWithSignature = appendSignature(rendered.body, candidate);
    const commId = insertCommunication({
      candidate_id: candidate.id,
      batch_id: batchId || candidate.batch_id || null,
      template_id: templateId,
      template_name: template.name,
      reminder_id: reminderId,
      type,
      recipient: candidate.email,
      subject: rendered.subject,
      body: bodyWithSignature,
    });

    db.prepare(
      `UPDATE email_communications SET status='SENDING', attempts = attempts + 1 WHERE id = ?`,
    ).run(commId);
    summary.attempted += 1;

    try {
      await sendEmail({ to: candidate.email, subject: rendered.subject, text: bodyWithSignature });
      db.prepare(
        `UPDATE email_communications SET status='SENT', sent_at=datetime('now'), failure_reason=NULL WHERE id=?`,
      ).run(commId);
      summary.sent += 1;
      summary.results.push({ candidate: candidate.email, status: "SENT" });
      log(
        `${type === "REMINDER" ? "Reminder" : "Welcome"} email sent to ${candidate.first_name} ${candidate.last_name ?? ""}`.trim(),
        {
          source: "EMAIL",
        },
      );
    } catch (error) {
      const reason = friendlyError(error);
      db.prepare(
        `UPDATE email_communications SET status='FAILED', failed_at=datetime('now'), failure_reason=? WHERE id=?`,
      ).run(reason, commId);
      summary.failed += 1;
      summary.results.push({ candidate: candidate.email, status: "FAILED", reason });
      log(`Email failed for ${candidate.email}: ${reason}`, { level: "ERROR", source: "EMAIL" });
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  return { ...summary, sender: senderAddress() };
}

/**
 * Shared WhatsApp/SMS sender. `channel` is 'WHATSAPP' or 'SMS'; `provider` is
 * the getXProvider() factory and `renderMessage` the matching template
 * renderer — the only two things that differ between the two channels.
 */
async function sendToChannel({
  channel,
  getProvider,
  providerName,
  renderMessage,
  candidates,
  type = "WELCOME",
  batchId = null,
  reminderId = null,
  force = false,
  skipPredicate = null,
}) {
  const pseudoTemplateId = `${channel.toLowerCase()}:${type}`;
  const summary = { attempted: 0, sent: 0, failed: 0, skipped: 0, results: [] };
  const provider = getProvider();

  for (const candidate of candidates) {
    const destination = candidate.phone_e164 || null;
    const skipReason = skipPredicate?.(candidate);

    if (skipReason) {
      summary.skipped += 1;
      summary.results.push({
        candidate: destination || candidate.phone || "—",
        status: "SKIPPED",
        reason: skipReason,
      });
      log(`Skipped ${channel} for ${candidate.first_name}: ${skipReason}`, { source: channel });
      continue;
    }
    // TEST MODE: duplicate protection intentionally bypassed for repeated prototype testing.
    // Production mode must enforce duplicate protection.
    if (
      !force &&
      duplicateProtectionActive(channel) &&
      alreadySent(candidate.id, pseudoTemplateId, type)
    ) {
      summary.skipped += 1;
      summary.results.push({
        candidate: destination || candidate.phone || "—",
        status: "SKIPPED",
        reason: "Already sent",
      });
      continue;
    }
    if (!destination) {
      const reason = "No valid phone number";
      const commId = insertCommunication({
        candidate_id: candidate.id,
        batch_id: batchId || candidate.batch_id || null,
        template_id: pseudoTemplateId,
        template_name: `${channel === "WHATSAPP" ? "WhatsApp" : "SMS"} ${type}`,
        reminder_id: reminderId,
        type,
        channel,
        provider: providerName,
        recipient: candidate.phone || "",
        subject: null,
        body: null,
        status: "SKIPPED",
        error_message: reason,
      });
      summary.skipped += 1;
      summary.results.push({ candidate: candidate.phone || "—", status: "SKIPPED", reason });
      log(`Skipped ${channel} for ${candidate.first_name}: ${reason}`, {
        source: channel,
        detail: commId,
      });
      continue;
    }

    const rendered = renderMessage(type, candidate);
    const commId = insertCommunication({
      candidate_id: candidate.id,
      batch_id: batchId || candidate.batch_id || null,
      template_id: pseudoTemplateId,
      template_name: rendered.templateName,
      reminder_id: reminderId,
      type,
      channel,
      provider: providerName,
      recipient: destination,
      subject: null,
      body: rendered.text,
    });
    db.prepare(
      `UPDATE email_communications SET status='SENDING', attempts = attempts + 1 WHERE id = ?`,
    ).run(commId);
    summary.attempted += 1;

    const result = await provider.sendMessage({
      to: destination,
      text: rendered.text,
      variables: rendered.variables,
      candidateId: candidate.id,
      reminderId,
      messageType: type,
    });

    if (result.ok) {
      db.prepare(
        `UPDATE email_communications SET status=?, sent_at=datetime('now'), provider_message_id=?, error_code=NULL, error_message=NULL WHERE id=?`,
      ).run(result.status || "SENT", result.providerMessageId || null, commId);
      summary.sent += 1;
      summary.results.push({ candidate: destination, status: "SENT" });
      log(
        `${type === "REMINDER" ? "Reminder" : "Welcome"} ${channel} sent to ${candidate.first_name} ${candidate.last_name ?? ""}`.trim(),
        { source: channel },
      );
    } else {
      db.prepare(
        `UPDATE email_communications SET status='FAILED', failed_at=datetime('now'), error_code=?, error_message=?, failure_reason=? WHERE id=?`,
      ).run(
        result.errorCode || null,
        result.errorMessage || null,
        result.errorMessage || "Unknown error",
        commId,
      );
      summary.failed += 1;
      summary.results.push({
        candidate: destination,
        status: "FAILED",
        reason: result.errorMessage,
      });
      log(`${channel} failed for ${destination}: ${result.errorMessage}`, {
        level: "ERROR",
        source: channel,
      });
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  return summary;
}

export async function sendWhatsAppToCandidates(params) {
  return sendToChannel({
    channel: "WHATSAPP",
    getProvider: getWhatsAppProvider,
    providerName: "TWILIO_WHATSAPP",
    renderMessage: renderWhatsAppMessage,
    ...params,
  });
}

export async function sendSmsToCandidates(params) {
  return sendToChannel({
    channel: "SMS",
    getProvider: getSmsProvider,
    providerName: "TWILIO_SMS",
    renderMessage: renderSmsMessage,
    ...params,
  });
}

const CHANNEL_SENDERS = {
  WHATSAPP: sendWhatsAppToCandidates,
  SMS: sendSmsToCandidates,
};

/**
 * Fans a send out across the recruiter-selected channels. EMAIL reuses
 * `sendToCandidates` untouched, so pure-email callers (existing behaviour)
 * are byte-for-byte unchanged. Returns a summary keyed by channel; one
 * channel failing (or being unconfigured) never stops the others.
 */
export async function sendChannelsToCandidates({
  candidates,
  channels,
  templateId = null,
  type = "WELCOME",
  batchId = null,
  reminderId = null,
  force = false,
  skipPredicate = null,
}) {
  const byChannel = {};
  // TEST MODE: duplicate protection intentionally bypassed for repeated prototype testing.
  // Production mode must enforce duplicate protection.
  const withReminderDedupe = (channel) => (candidate) => {
    const base = skipPredicate?.(candidate);
    if (base) return base;
    if (
      reminderId &&
      duplicateProtectionActive(channel) &&
      alreadySentForReminderChannel(candidate.id, reminderId, channel)
    ) {
      return "Already sent for this reminder";
    }
    return null;
  };

  for (const channel of channels) {
    if (channel === "EMAIL") {
      if (!templateId) {
        byChannel.EMAIL = {
          attempted: 0,
          sent: 0,
          failed: 0,
          skipped: candidates.length,
          results: [],
          error: "No email template selected",
        };
        continue;
      }
      byChannel.EMAIL = await sendToCandidates({
        candidates,
        templateId,
        type,
        batchId,
        reminderId,
        force,
        skipPredicate: withReminderDedupe("EMAIL"),
      });
    } else if (CHANNEL_SENDERS[channel]) {
      byChannel[channel] = await CHANNEL_SENDERS[channel]({
        candidates,
        type,
        batchId,
        reminderId,
        force,
        skipPredicate: withReminderDedupe(channel),
      });
    }
  }
  return byChannel;
}

/** Sums attempted/sent/failed/skipped across a sendChannelsToCandidates() result. */
export function mergeChannelSummaries(byChannel) {
  const out = { attempted: 0, sent: 0, failed: 0, skipped: 0 };
  for (const summary of Object.values(byChannel)) {
    out.attempted += summary.attempted || 0;
    out.sent += summary.sent || 0;
    out.failed += summary.failed || 0;
    out.skipped += summary.skipped || 0;
  }
  return out;
}

/** Bounded retry — works across EMAIL/WHATSAPP/SMS rows via the same provider seam as a fresh send. */
export async function retryCommunication(id) {
  const comm = db.prepare(`SELECT * FROM email_communications WHERE id = ?`).get(id);
  if (!comm) throw new Error("Communication not found");
  if (comm.attempts >= MAX_RETRY_ATTEMPTS) {
    throw new Error(`Retry limit reached (${MAX_RETRY_ATTEMPTS} attempts) for this communication.`);
  }
  db.prepare(
    `UPDATE email_communications SET status='SENDING', attempts = attempts + 1 WHERE id=?`,
  ).run(id);

  if (comm.channel === "WHATSAPP" || comm.channel === "SMS") {
    const provider = comm.channel === "WHATSAPP" ? getWhatsAppProvider() : getSmsProvider();
    // WhatsApp retries must re-resolve variables from the candidate, not
    // just replay the stored `body` text — the provider now resolves the
    // Content SID itself from `messageType`, and needs fresh `variables`
    // for ContentVariables (the original send may have failed before any
    // Content SID was configured at all, e.g. the "ContentSid Required"
    // failures this retry path exists to recover from).
    const candidate = comm.channel === "WHATSAPP" ? getCandidate(comm.candidate_id) : null;
    const result = await provider.sendMessage({
      to: comm.recipient,
      text: comm.body,
      variables: candidate ? candidateVariables(candidate) : null,
      candidateId: comm.candidate_id,
      reminderId: comm.reminder_id,
      messageType: comm.type,
    });
    if (result.ok) {
      db.prepare(
        `UPDATE email_communications SET status=?, sent_at=datetime('now'), provider_message_id=?, error_code=NULL, error_message=NULL, failure_reason=NULL WHERE id=?`,
      ).run(result.status || "SENT", result.providerMessageId || null, id);
      log(`Retry succeeded for ${comm.recipient} (${comm.channel})`, { source: comm.channel });
      return { ok: true };
    }
    db.prepare(
      `UPDATE email_communications SET status='FAILED', failed_at=datetime('now'), error_code=?, error_message=?, failure_reason=? WHERE id=?`,
    ).run(
      result.errorCode || null,
      result.errorMessage || null,
      result.errorMessage || "Unknown error",
      id,
    );
    log(`Retry failed for ${comm.recipient} (${comm.channel}): ${result.errorMessage}`, {
      level: "ERROR",
      source: comm.channel,
    });
    return { ok: false, message: result.errorMessage };
  }

  try {
    await sendEmail({ to: comm.recipient, subject: comm.subject, text: comm.body });
    db.prepare(
      `UPDATE email_communications SET status='SENT', sent_at=datetime('now'), failure_reason=NULL, error_code=NULL, error_message=NULL WHERE id=?`,
    ).run(id);
    log(`Retry succeeded for ${comm.recipient}`, { source: "EMAIL" });
    return { ok: true };
  } catch (error) {
    const reason = friendlyError(error);
    db.prepare(
      `UPDATE email_communications SET status='FAILED', failed_at=datetime('now'), failure_reason=? WHERE id=?`,
    ).run(reason, id);
    return { ok: false, message: reason };
  }
}

/**
 * `welcomeSent` / `reminderSent` / `failed` / `today` are scoped to
 * channel='EMAIL' so the existing "Welcome emails sent" KPI keeps meaning
 * exactly what it always meant, even after WhatsApp/SMS rows start sharing
 * this table. Channel totals are exposed separately via `channels`.
 */
export function emailStats() {
  const get = (sql, ...params) => db.prepare(sql).get(...params)?.n ?? 0;
  const sentStatuses = "('SENT','DELIVERED','READ')";
  return {
    candidates: get(`SELECT COUNT(*) n FROM candidates`),
    welcomeSent: get(
      `SELECT COUNT(*) n FROM email_communications WHERE type='WELCOME' AND channel='EMAIL' AND status IN ${sentStatuses}`,
    ),
    reminderSent: get(
      `SELECT COUNT(*) n FROM email_communications WHERE type='REMINDER' AND channel='EMAIL' AND status IN ${sentStatuses}`,
    ),
    remindersScheduled: get(`SELECT COUNT(*) n FROM reminder_schedules WHERE status='SCHEDULED'`),
    failed: get(
      `SELECT COUNT(*) n FROM email_communications WHERE channel='EMAIL' AND status='FAILED'`,
    ),
    today: get(
      `SELECT COUNT(*) n FROM email_communications WHERE channel='EMAIL' AND status IN ${sentStatuses} AND date(sent_at) = date('now')`,
    ),
    channels: {
      email: {
        sent: get(
          `SELECT COUNT(*) n FROM email_communications WHERE channel='EMAIL' AND status IN ${sentStatuses}`,
        ),
        failed: get(
          `SELECT COUNT(*) n FROM email_communications WHERE channel='EMAIL' AND status='FAILED'`,
        ),
      },
      whatsapp: {
        sent: get(
          `SELECT COUNT(*) n FROM email_communications WHERE channel='WHATSAPP' AND status IN ${sentStatuses}`,
        ),
        failed: get(
          `SELECT COUNT(*) n FROM email_communications WHERE channel='WHATSAPP' AND status='FAILED'`,
        ),
      },
      sms: {
        sent: get(
          `SELECT COUNT(*) n FROM email_communications WHERE channel='SMS' AND status IN ${sentStatuses}`,
        ),
        failed: get(
          `SELECT COUNT(*) n FROM email_communications WHERE channel='SMS' AND status='FAILED'`,
        ),
      },
    },
    pending: get(
      `SELECT COUNT(*) n FROM email_communications WHERE status IN ('QUEUED','SENDING')`,
    ),
  };
}

export function recentLogs(limit = 30) {
  return db.prepare(`SELECT * FROM automation_logs ORDER BY created_at DESC LIMIT ?`).all(limit);
}
