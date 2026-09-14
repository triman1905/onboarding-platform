import { Router } from "express";
import { db, log } from "../db/database.js";
import { getCandidate, listCandidates } from "../services/batchService.js";
import {
  emailStats,
  listCommunications,
  mergeChannelSummaries,
  retryCommunication,
  sendChannelsToCandidates,
} from "../services/communicationService.js";
import {
  isWhatsAppConfigured,
  isWhatsAppContentReady,
} from "../services/communication/providers/whatsappProvider.js";
import { isSmsConfigured } from "../services/communication/providers/smsProvider.js";
import {
  renderWhatsAppMessage,
  renderSmsMessage,
} from "../services/communication/messageTemplates.js";
import { mapTwilioStatus } from "../services/communication/twilioClient.js";
import { listChannelTemplates } from "../services/communication/channelTemplates.js";
import { canAccessCandidate, filterCandidatesForUser, requireAuth } from "../middleware/auth.js";

export const communicationRoutes = Router();

function resolveCandidates({ batchId, candidateIds }) {
  if (Array.isArray(candidateIds) && candidateIds.length) {
    return candidateIds.map((id) => getCandidate(id)).filter(Boolean);
  }
  if (batchId) return listCandidates({ batchId });
  return [];
}

/**
 * Twilio's delivery-status webhook — must stay public (Twilio calls it
 * server-to-server, never carries our session token). Registered before
 * `requireAuth` below so it's the one route on this router left unauthenticated.
 */
communicationRoutes.post("/twilio/status", (req, res) => {
  const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = req.body ?? {};
  if (!MessageSid) return res.status(400).end();

  const mapped = mapTwilioStatus(MessageStatus);
  const row = db
    .prepare(`SELECT id FROM email_communications WHERE provider_message_id = ?`)
    .get(MessageSid);
  if (row && mapped) {
    if (mapped === "FAILED") {
      db.prepare(
        `UPDATE email_communications SET status='FAILED', failed_at=datetime('now'), error_code=?, error_message=? WHERE id=?`,
      ).run(ErrorCode || null, ErrorMessage || `Delivery failed (${MessageStatus})`, row.id);
    } else {
      db.prepare(`UPDATE email_communications SET status=? WHERE id=?`).run(mapped, row.id);
    }
    log(`Twilio status callback: ${MessageSid} -> ${MessageStatus}`, { source: "TWILIO" });
  }
  res.status(200).end();
});

communicationRoutes.use(requireAuth);

/** Overall channel configuration — never exposes credentials, only booleans. */
communicationRoutes.get("/status", (_req, res) => {
  res.json({
    testMode: process.env.TEST_MODE !== "false",
    channels: {
      email: { configured: true, provider: "GMAIL" },
      whatsapp: {
        configured: isWhatsAppConfigured(),
        // Content SID presence per message type — never the SID value itself.
        welcomeTemplateConfigured: isWhatsAppContentReady("WELCOME"),
        reminderTemplateConfigured: isWhatsAppContentReady("REMINDER"),
        provider: "TWILIO_WHATSAPP",
      },
      sms: { configured: isSmsConfigured(), provider: "TWILIO_SMS" },
    },
    stats: emailStats(),
  });
});

communicationRoutes.get("/status/:id", (req, res) => {
  const row = db.prepare(`SELECT * FROM email_communications WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ message: "Communication not found" });
  const candidate = row.candidate_id ? getCandidate(row.candidate_id) : null;
  if (candidate && !canAccessCandidate(candidate, req.user)) {
    return res.status(403).json({ message: "You do not have access to this communication" });
  }
  res.json(row);
});

/**
 * Channel-template picklists for the UI's per-channel template dropdowns
 * (Reminder scheduling, Review & Send). Backed by the code-level config in
 * channelTemplates.js — EMAIL's own database-backed templates are still
 * fetched separately via GET /api/templates.
 */
communicationRoutes.get("/templates", (_req, res) => {
  res.json({
    EMAIL: listChannelTemplates("EMAIL"),
    WHATSAPP: listChannelTemplates("WHATSAPP"),
    SMS: listChannelTemplates("SMS"),
  });
});

communicationRoutes.get("/history", (req, res) => {
  res.json(
    listCommunications({
      status: req.query.status,
      type: req.query.type,
      batchId: req.query.batchId,
      // Backend-enforced scope — never relies on the client to filter.
      assignedToUserId: req.user.role === "MANAGER" ? undefined : req.user.id,
    }),
  );
});

/** Preview a WhatsApp or SMS message body for one candidate without sending it. */
communicationRoutes.get("/preview", (req, res) => {
  const { candidateId, channel = "WHATSAPP", type = "WELCOME" } = req.query;
  const candidate = getCandidate(candidateId);
  if (!candidate) return res.status(404).json({ message: "Candidate not found" });
  if (!canAccessCandidate(candidate, req.user)) {
    return res.status(403).json({ message: "You do not have access to this candidate" });
  }
  const renderer = channel === "SMS" ? renderSmsMessage : renderWhatsAppMessage;
  const rendered = renderer(type, candidate);
  res.json({
    candidateId: candidate.id,
    candidateName: `${candidate.first_name} ${candidate.last_name ?? ""}`.trim(),
    to: candidate.phone_e164 || null,
    channel,
    templateName: rendered.templateName,
    body: rendered.text,
    missingDestination: !candidate.phone_e164,
  });
});

communicationRoutes.post("/whatsapp/send", async (req, res) => {
  const { batchId, candidateIds, type = "WELCOME", force = false, confirm } = req.body ?? {};
  if (!confirm)
    return res.status(400).json({ message: "Explicit confirmation is required before sending" });
  const candidates = filterCandidatesForUser(resolveCandidates({ batchId, candidateIds }), req.user);
  if (!candidates.length) return res.status(400).json({ message: "No candidates selected" });
  const byChannel = await sendChannelsToCandidates({
    candidates,
    channels: ["WHATSAPP"],
    type,
    batchId,
    force,
  });
  res.json({ ...byChannel.WHATSAPP, byChannel });
});

communicationRoutes.post("/sms/send", async (req, res) => {
  const { batchId, candidateIds, type = "WELCOME", force = false, confirm } = req.body ?? {};
  if (!confirm)
    return res.status(400).json({ message: "Explicit confirmation is required before sending" });
  const candidates = filterCandidatesForUser(resolveCandidates({ batchId, candidateIds }), req.user);
  if (!candidates.length) return res.status(400).json({ message: "No candidates selected" });
  const byChannel = await sendChannelsToCandidates({
    candidates,
    channels: ["SMS"],
    type,
    batchId,
    force,
  });
  res.json({ ...byChannel.SMS, byChannel });
});

/**
 * Multi-channel bulk send — the backing endpoint for the "Communication
 * Channels" checkboxes on the Welcome tab. EMAIL requires `templateId`;
 * WHATSAPP/SMS use their built-in provider-neutral templates.
 */
communicationRoutes.post("/bulk-send", async (req, res) => {
  const {
    batchId,
    candidateIds,
    channels,
    templateId,
    type = "WELCOME",
    force = false,
    confirm,
  } = req.body ?? {};
  if (!confirm)
    return res.status(400).json({ message: "Explicit confirmation is required before sending" });
  if (!Array.isArray(channels) || !channels.length) {
    return res.status(400).json({ message: "Select at least one communication channel" });
  }
  const candidates = filterCandidatesForUser(resolveCandidates({ batchId, candidateIds }), req.user);
  if (!candidates.length) return res.status(400).json({ message: "No candidates selected" });

  try {
    const byChannel = await sendChannelsToCandidates({
      candidates,
      channels,
      templateId,
      type,
      batchId,
      force,
    });
    res.json({ ...mergeChannelSummaries(byChannel), byChannel });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

communicationRoutes.post("/:id/retry", async (req, res) => {
  const comm = db.prepare(`SELECT candidate_id FROM email_communications WHERE id = ?`).get(
    req.params.id,
  );
  if (!comm) return res.status(404).json({ message: "Communication not found" });
  const candidate = comm.candidate_id ? getCandidate(comm.candidate_id) : null;
  if (candidate && !canAccessCandidate(candidate, req.user)) {
    return res.status(403).json({ message: "You do not have access to this communication" });
  }
  try {
    const result = await retryCommunication(req.params.id);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
