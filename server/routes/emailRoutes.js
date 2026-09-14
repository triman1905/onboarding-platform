import { Router } from "express";
import { isConfigured, senderAddress, verifyEmailConnection } from "../services/emailService.js";
import {
  alreadySent,
  emailStats,
  listCommunications,
  recentLogs,
  retryCommunication,
  sendToCandidates,
} from "../services/communicationService.js";
import { getCandidate, listCandidates } from "../services/batchService.js";
import {
  isWhatsAppConfigured,
  isWhatsAppContentReady,
} from "../services/communication/providers/whatsappProvider.js";
import { isSmsConfigured } from "../services/communication/providers/smsProvider.js";
import { canAccessCandidate, filterCandidatesForUser, requireAuth } from "../middleware/auth.js";
import { db } from "../db/database.js";

export const emailRoutes = Router();

/**
 * Public on purpose: `src/lib/email/api.ts`'s `probeLocal()` calls this with a bare,
 * unauthenticated `fetch()` to detect whether the local Express backend is reachable
 * before deciding LOCAL vs. hosted-fallback. Requiring auth here made that probe
 * 401 → misdetect "not local" → silently fall back to the Supabase-backed hosted
 * path for every emailApi.* call. Only aggregate counts are returned, no candidate
 * data, so this stays out of `requireAuth` intentionally (same pattern as /api/health).
 */
emailRoutes.get("/status", (_req, res) => {
  res.json({
    provider: "Gmail",
    configured: isConfigured(),
    sender: senderAddress(),
    testMode: process.env.TEST_MODE !== "false",
    stats: emailStats(),
    channels: {
      email: { configured: isConfigured(), provider: "GMAIL" },
      whatsapp: {
        configured: isWhatsAppConfigured(),
        welcomeTemplateConfigured: isWhatsAppContentReady("WELCOME"),
        reminderTemplateConfigured: isWhatsAppContentReady("REMINDER"),
        provider: "TWILIO_WHATSAPP",
      },
      sms: { configured: isSmsConfigured(), provider: "TWILIO_SMS" },
    },
  });
});

emailRoutes.use(requireAuth);

emailRoutes.post("/test", async (_req, res) => {
  const result = await verifyEmailConnection();
  res.status(result.ok ? 200 : 400).json(result);
});

emailRoutes.get("/history", (req, res) => {
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

emailRoutes.get("/logs", (_req, res) => {
  res.json(recentLogs(40));
});

/**
 * Bulk send. Requires explicit candidate selection or a batch id,
 * plus `confirm: true` from the UI confirmation dialog.
 */
emailRoutes.post("/send-batch", async (req, res) => {
  const {
    batchId,
    candidateIds,
    templateId,
    type = "WELCOME",
    force = false,
    confirm,
  } = req.body ?? {};
  if (!confirm) {
    return res
      .status(400)
      .json({ message: "Explicit confirmation is required before sending emails" });
  }
  if (!templateId) return res.status(400).json({ message: "templateId is required" });

  let candidates = [];
  if (Array.isArray(candidateIds) && candidateIds.length) {
    candidates = candidateIds.map((id) => getCandidate(id)).filter(Boolean);
  } else if (batchId) {
    candidates = listCandidates({ batchId });
  }
  // Backend-enforced scope: a TEAM_MEMBER's send silently excludes candidates
  // that aren't theirs (reflected in the response's skipped/attempted counts).
  candidates = filterCandidatesForUser(candidates, req.user);
  if (!candidates.length) return res.status(400).json({ message: "No candidates selected" });

  try {
    const summary = await sendToCandidates({ candidates, templateId, type, batchId, force });
    res.json(summary);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/** Which of these candidates already received this template (duplicate protection). */
emailRoutes.post("/check-duplicates", (req, res) => {
  const { candidateIds = [], templateId, type = "WELCOME" } = req.body ?? {};
  const duplicates = candidateIds.filter((id) => {
    const candidate = getCandidate(id);
    if (!candidate || !canAccessCandidate(candidate, req.user)) return false;
    return Boolean(alreadySent(candidate.id, templateId, type));
  });
  res.json({ duplicates });
});

emailRoutes.post("/retry/:id", async (req, res) => {
  const comm = db
    .prepare(`SELECT candidate_id FROM email_communications WHERE id = ?`)
    .get(req.params.id);
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
