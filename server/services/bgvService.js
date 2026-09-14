import { db, log, uid } from "../db/database.js";
import { getCandidate } from "./batchService.js";

export const BGV_STATUSES = ["PENDING", "IN_PROGRESS", "CLEAR", "DISCREPANT"];
export const OVERALL_BGV_STATUSES = ["DISCREPANT", "INDUCTION_READY", "IN_PROGRESS", "NOT_READY"];

/**
 * The single, authoritative Overall BGV calculation. Every surface (table,
 * candidate detail, KPIs, filters) reads the `overall_bgv_status` column this
 * function produces — nothing else re-derives it.
 *
 * Priority: DISCREPANT > INDUCTION_READY > IN_PROGRESS > NOT_READY.
 */
export function calculateOverallBgvStatus(clientStatus, eyStatus) {
  if (clientStatus === "DISCREPANT" || eyStatus === "DISCREPANT") return "DISCREPANT";
  if (clientStatus === "CLEAR" && eyStatus === "CLEAR") return "INDUCTION_READY";
  if (clientStatus === "IN_PROGRESS" || eyStatus === "IN_PROGRESS") return "IN_PROGRESS";
  return "NOT_READY";
}

function recordAudit({ candidateId, field, oldValue, newValue, changedBy }) {
  db.prepare(
    `INSERT INTO candidate_audit_log (id, candidate_id, field, old_value, new_value, changed_by) VALUES (?,?,?,?,?,?)`,
  ).run(uid("audit"), candidateId, field, oldValue ?? null, newValue ?? null, changedBy ?? null);
}

/** Updates BGV-by-Client or BGV-by-EY, recomputes Overall, and writes an audit row. */
export function updateBgvField(candidateId, field, value, changedBy) {
  if (!["bgv_client_status", "bgv_ey_status"].includes(field)) {
    throw new Error("Invalid BGV field");
  }
  if (!BGV_STATUSES.includes(value)) {
    throw new Error(`Invalid BGV status. Allowed: ${BGV_STATUSES.join(", ")}`);
  }
  const current = getCandidate(candidateId);
  if (!current) throw new Error("Candidate not found");

  const nextClient = field === "bgv_client_status" ? value : current.bgv_client_status;
  const nextEy = field === "bgv_ey_status" ? value : current.bgv_ey_status;
  const overall = calculateOverallBgvStatus(nextClient, nextEy);

  db.prepare(
    `UPDATE candidates SET ${field} = ?, overall_bgv_status = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(value, overall, current.id);

  recordAudit({
    candidateId: current.id,
    field,
    oldValue: current[field],
    newValue: value,
    changedBy,
  });
  if (overall !== current.overall_bgv_status) {
    recordAudit({
      candidateId: current.id,
      field: "overall_bgv_status",
      oldValue: current.overall_bgv_status,
      newValue: overall,
      changedBy,
    });
  }

  log(`BGV ${field} updated to ${value} for candidate ${current.candidate_id}`, {
    source: "BGV",
  });
  return getCandidate(current.id);
}
