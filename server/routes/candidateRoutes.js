import { Router } from "express";
import {
  createCandidate,
  getCandidate,
  listCandidates,
  setVerificationStatus,
} from "../services/batchService.js";
import { db, log, uid } from "../db/database.js";
import { requireAuth, requireCandidateAccess, requireRole } from "../middleware/auth.js";
import { BGV_STATUSES, updateBgvField } from "../services/bgvService.js";
import { listCommunicationsForCandidate } from "../services/communicationService.js";
import {
  applyCsvAssignment,
  assignBulk,
  autoDistribute,
  validateCsvAssignment,
} from "../services/assignmentService.js";
import { getTeamForManager } from "../services/teamService.js";
import { lastAuditForCandidate, listAuditForCandidate } from "../services/auditService.js";

export const candidateRoutes = Router();
candidateRoutes.use(requireAuth);

const COMMUNICATION_MEDIA = [
  "EMAIL",
  "WHATSAPP",
  "SMS",
  "EMAIL_WHATSAPP",
  "EMAIL_SMS",
  "WHATSAPP_SMS",
  "ALL",
  "NONE",
];

const DOCUMENT_STATUSES = ["PENDING", "SUBMITTED", "VERIFIED"];

/**
 * A TEAM_MEMBER always gets `assigned_to_user_id = req.user.id` forced,
 * regardless of any `?assignedTo=` query param — never trusting a
 * client-supplied override. A MANAGER sees everything and may optionally
 * filter by a specific team member via `?assignedTo=`.
 */
candidateRoutes.get("/", (req, res) => {
  const assignedToUserId =
    req.user.role === "MANAGER" ? req.query.assignedTo || undefined : req.user.id;
  res.json(
    listCandidates({ batchId: req.query.batchId, search: req.query.search, assignedToUserId }),
  );
});

/** Manual candidate entry — the alternative to CSV/XLSX import. Manager-only, same as batch/CSV creation. */
candidateRoutes.post("/", requireRole("MANAGER"), (req, res) => {
  try {
    res.json(createCandidate(req.body ?? {}));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ---------------------------------------------------------------------------
// Assignment (manager-only). Registered before "/:id" routes so "/assign/*"
// never gets swallowed by a single-segment "/:id" match.
// ---------------------------------------------------------------------------

candidateRoutes.post("/assign/bulk", requireRole("MANAGER"), (req, res) => {
  try {
    const { candidateIds, teamMemberId } = req.body ?? {};
    res.json(assignBulk({ candidateIds, teamMemberId, managerUser: req.user }));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

candidateRoutes.post("/assign/auto-distribute", requireRole("MANAGER"), (req, res) => {
  try {
    const { candidateIds, includeAssigned } = req.body ?? {};
    res.json(autoDistribute({ candidateIds, includeAssigned, managerUser: req.user }));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/** Validates CSV rows and returns valid/invalid breakdown WITHOUT writing anything. */
candidateRoutes.post("/assign/csv/validate", requireRole("MANAGER"), (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    res.json(validateCsvAssignment(rows, req.user));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/** Applies only the rows the client already validated and the manager confirmed. */
candidateRoutes.post("/assign/csv/apply", requireRole("MANAGER"), (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    res.json(applyCsvAssignment(rows, req.user));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ---------------------------------------------------------------------------
// Single-candidate routes
// ---------------------------------------------------------------------------

candidateRoutes.get("/:id", requireCandidateAccess, (req, res) => {
  res.json(req.candidate);
});

/** Used to demo the "already completed → skipped" reminder behaviour. */
candidateRoutes.patch("/:id/status", requireCandidateAccess, (req, res) => {
  const { status } = req.body ?? {};
  if (!status) return res.status(400).json({ message: "status is required" });
  res.json(setVerificationStatus(req.candidate.id, status));
});

candidateRoutes.patch("/:id/bgv", requireCandidateAccess, (req, res) => {
  try {
    const { field, value } = req.body ?? {};
    res.json(updateBgvField(req.candidate.id, field, value, req.user.id));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

candidateRoutes.patch("/:id/communication", requireCandidateAccess, (req, res) => {
  const { value } = req.body ?? {};
  if (!COMMUNICATION_MEDIA.includes(value)) {
    return res.status(400).json({
      message: `Invalid communication medium. Allowed: ${COMMUNICATION_MEDIA.join(", ")}`,
    });
  }
  db.prepare(
    `UPDATE candidates SET communication_medium = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(value, req.candidate.id);
  db.prepare(
    `INSERT INTO candidate_audit_log (id, candidate_id, field, old_value, new_value, changed_by) VALUES (?,?,'communication_medium',?,?,?)`,
  ).run(uid("audit"), req.candidate.id, req.candidate.communication_medium, value, req.user.id);
  res.json(getCandidate(req.candidate.id));
});

candidateRoutes.patch("/:id/remarks", requireCandidateAccess, (req, res) => {
  const remarks = typeof req.body?.remarks === "string" ? req.body.remarks : "";
  db.prepare(`UPDATE candidates SET remarks = ?, updated_at = datetime('now') WHERE id = ?`).run(
    remarks,
    req.candidate.id,
  );
  db.prepare(
    `INSERT INTO candidate_audit_log (id, candidate_id, field, old_value, new_value, changed_by) VALUES (?,?,'remarks',?,?,?)`,
  ).run(uid("audit"), req.candidate.id, req.candidate.remarks, remarks, req.user.id);
  log(`Remarks updated for candidate ${req.candidate.candidate_id}`, { source: "CANDIDATE" });
  res.json(getCandidate(req.candidate.id));
});

candidateRoutes.patch("/:id/documents-status", requireCandidateAccess, (req, res) => {
  const { status } = req.body ?? {};
  if (!DOCUMENT_STATUSES.includes(status)) {
    return res
      .status(400)
      .json({ message: `Invalid documents status. Allowed: ${DOCUMENT_STATUSES.join(", ")}` });
  }
  db.prepare(
    `UPDATE candidates SET documents_status = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(status, req.candidate.id);
  db.prepare(
    `INSERT INTO candidate_audit_log (id, candidate_id, field, old_value, new_value, changed_by) VALUES (?,?,'documents_status',?,?,?)`,
  ).run(uid("audit"), req.candidate.id, req.candidate.documents_status, status, req.user.id);
  res.json(getCandidate(req.candidate.id));
});

candidateRoutes.patch("/:id/next-action", requireCandidateAccess, (req, res) => {
  const value = typeof req.body?.value === "string" ? req.body.value : "";
  db.prepare(
    `UPDATE candidates SET next_action = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(value, req.candidate.id);
  db.prepare(
    `INSERT INTO candidate_audit_log (id, candidate_id, field, old_value, new_value, changed_by) VALUES (?,?,'next_action',?,?,?)`,
  ).run(uid("audit"), req.candidate.id, req.candidate.next_action, value, req.user.id);
  res.json(getCandidate(req.candidate.id));
});

/** Full audit trail for this candidate — a TEAM_MEMBER can never read another candidate's, same gate as every other single-candidate route. */
candidateRoutes.get("/:id/audit", requireCandidateAccess, (req, res) => {
  res.json(listAuditForCandidate(req.candidate.id));
});

/** Backend-scoped communication history for exactly this candidate — the fix for the
 *  reviewed security issue: a TEAM_MEMBER can never read another candidate's history,
 *  because requireCandidateAccess above already 403s before any row is read. */
candidateRoutes.get("/:id/communications", requireCandidateAccess, (req, res) => {
  res.json(listCommunicationsForCandidate(req.candidate.id));
});

candidateRoutes.get("/:id/summary", requireCandidateAccess, (req, res) => {
  const candidate = req.candidate;
  let assignedTo = null;
  if (candidate.assigned_to_user_id) {
    const user = db
      .prepare(`SELECT id, name, role FROM users WHERE id = ?`)
      .get(candidate.assigned_to_user_id);
    if (user) assignedTo = user;
  }
  const team = req.user.role === "MANAGER" ? getTeamForManager(req.user.id) : null;
  res.json({
    candidate,
    assignedTo,
    communications: listCommunicationsForCandidate(candidate.id),
    team,
    lastActivity: lastAuditForCandidate(candidate.id),
  });
});
