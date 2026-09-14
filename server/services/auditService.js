import { db } from "../db/database.js";

/**
 * Full audit trail for one candidate, newest first, with the acting user's
 * display name resolved (falls back to the raw `changed_by` id if the user
 * was later removed). Always call behind `requireCandidateAccess` — a
 * TEAM_MEMBER must never read another candidate's audit history.
 *
 * `old_value_label`/`new_value_label` additionally resolve a value to a
 * user's display name when it happens to be a user id (this only ever
 * matters for `field = 'assigned_to_user_id'` rows — for every other field
 * the join simply finds no match and falls back to the raw value).
 */
export function listAuditForCandidate(candidateId) {
  return db
    .prepare(
      `SELECT a.id, a.candidate_id, a.field, a.old_value, a.new_value, a.changed_at,
              COALESCE(u.name, a.changed_by) AS changed_by_name,
              COALESCE(ou.name, a.old_value) AS old_value_label,
              COALESCE(nu.name, a.new_value) AS new_value_label
       FROM candidate_audit_log a
       LEFT JOIN users u ON u.id = a.changed_by
       LEFT JOIN users ou ON ou.id = a.old_value
       LEFT JOIN users nu ON nu.id = a.new_value
       WHERE a.candidate_id = ?
       ORDER BY a.changed_at DESC`,
    )
    .all(candidateId);
}

/** Most recent audit row for a candidate — powers "Last Action" / "Last Activity". */
export function lastAuditForCandidate(candidateId) {
  return (
    db
      .prepare(
        `SELECT a.id, a.candidate_id, a.field, a.old_value, a.new_value, a.changed_at,
                COALESCE(u.name, a.changed_by) AS changed_by_name
         FROM candidate_audit_log a
         LEFT JOIN users u ON u.id = a.changed_by
         WHERE a.candidate_id = ?
         ORDER BY a.changed_at DESC LIMIT 1`,
      )
      .get(candidateId) ?? null
  );
}
