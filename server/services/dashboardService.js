import { db } from "../db/database.js";
import { listBatches } from "./batchService.js";

/**
 * Real, SQLite-backed dashboard KPIs — scoped exactly like `GET /api/candidates`
 * (candidateRoutes.js): a TEAM_MEMBER always gets `assigned_to_user_id = user.id`
 * forced, a MANAGER sees everything (optionally narrowed to one batch).
 *
 * KPI definitions (documented because the spec's field names aren't all
 * mutually exclusive):
 *  - totalCandidates / inductionReady / notReady / discrepant / inProgress —
 *    a clean partition of `overall_bgv_status` (sums to totalCandidates).
 *  - bgvComplete — same condition as inductionReady (both sides CLEAR),
 *    exposed as its own key because the spec's JSON contract lists it separately.
 *  - bgvPending — broader "hasn't even started" bucket: either side still
 *    PENDING (can overlap with inProgress).
 */
export function getDashboardSummary(user, { batchId } = {}) {
  const clauses = [];
  const params = [];
  if (user.role !== "MANAGER") {
    clauses.push("assigned_to_user_id = ?");
    params.push(user.id);
  }
  if (batchId) {
    clauses.push("batch_id = ?");
    params.push(batchId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const kpis = db
    .prepare(
      `SELECT
         COUNT(*) AS totalCandidates,
         SUM(CASE WHEN overall_bgv_status = 'INDUCTION_READY' THEN 1 ELSE 0 END) AS inductionReady,
         SUM(CASE WHEN overall_bgv_status = 'NOT_READY' THEN 1 ELSE 0 END) AS notReady,
         SUM(CASE WHEN overall_bgv_status = 'DISCREPANT' THEN 1 ELSE 0 END) AS discrepant,
         SUM(CASE WHEN overall_bgv_status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS inProgress,
         SUM(CASE WHEN bgv_client_status = 'CLEAR' AND bgv_ey_status = 'CLEAR' THEN 1 ELSE 0 END) AS bgvComplete,
         SUM(CASE WHEN bgv_client_status = 'PENDING' OR bgv_ey_status = 'PENDING' THEN 1 ELSE 0 END) AS bgvPending
       FROM candidates ${where}`,
    )
    .get(...params);

  const verificationBreakdown = db
    .prepare(
      `SELECT verification_status AS status, COUNT(*) AS count FROM candidates ${where} GROUP BY verification_status ORDER BY count DESC`,
    )
    .all(...params);

  const activityWhere = user.role !== "MANAGER" ? "WHERE c.assigned_to_user_id = ?" : "";
  const activityParams = user.role !== "MANAGER" ? [user.id] : [];
  const recentActivity = db
    .prepare(
      `SELECT a.id, a.field, a.old_value, a.new_value, a.changed_at,
              COALESCE(u.name, a.changed_by) AS changed_by_name,
              c.id AS candidate_id, c.candidate_id AS candidate_ref, c.first_name, c.last_name
       FROM candidate_audit_log a
       JOIN candidates c ON c.id = a.candidate_id
       LEFT JOIN users u ON u.id = a.changed_by
       ${activityWhere}
       ORDER BY a.changed_at DESC LIMIT 10`,
    )
    .all(...activityParams);

  const upcomingReminders = db
    .prepare(
      `SELECT id, name, scheduled_at, target_condition, channels
       FROM reminder_schedules WHERE status = 'SCHEDULED' ORDER BY scheduled_at ASC LIMIT 5`,
    )
    .all();

  const attentionClauses = [...clauses, "overall_bgv_status = 'DISCREPANT'"];
  const needsAttention = db
    .prepare(
      `SELECT id, candidate_id, first_name, last_name, batch_id, bgv_client_status, bgv_ey_status, updated_at
       FROM candidates
       WHERE ${attentionClauses.join(" AND ")}
       ORDER BY updated_at ASC LIMIT 25`,
    )
    .all(...params);

  return {
    totalCandidates: kpis.totalCandidates ?? 0,
    bgvComplete: kpis.bgvComplete ?? 0,
    bgvPending: kpis.bgvPending ?? 0,
    discrepant: kpis.discrepant ?? 0,
    inductionReady: kpis.inductionReady ?? 0,
    notReady: kpis.notReady ?? 0,
    inProgress: kpis.inProgress ?? 0,
    verificationBreakdown,
    recentActivity,
    upcomingReminders,
    needsAttention,
    batches: listBatches().map((b) => ({
      ...b,
      discrepant_count: db
        .prepare(
          `SELECT COUNT(*) AS n FROM candidates WHERE batch_id = ? AND overall_bgv_status = 'DISCREPANT'`,
        )
        .get(b.id).n,
    })),
  };
}
