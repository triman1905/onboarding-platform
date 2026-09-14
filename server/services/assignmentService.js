import { db, log, uid } from "../db/database.js";
import { getCandidate } from "./batchService.js";
import { getTeamForManager } from "./teamService.js";

function recordAudit({ candidateId, oldValue, newValue, changedBy }) {
  db.prepare(
    `INSERT INTO candidate_audit_log (id, candidate_id, field, old_value, new_value, changed_by) VALUES (?,?,'assigned_to_user_id',?,?,?)`,
  ).run(uid("audit"), candidateId, oldValue ?? null, newValue ?? null, changedBy ?? null);
}

function setAssignment(candidate, teamMemberId, assignedBy) {
  db.prepare(
    `UPDATE candidates SET assigned_to_user_id = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(teamMemberId, candidate.id);
  recordAudit({
    candidateId: candidate.id,
    oldValue: candidate.assigned_to_user_id,
    newValue: teamMemberId,
    changedBy: assignedBy,
  });
}

function activeTeamMemberIds(team) {
  return team.members.filter((m) => m.isActive).map((m) => m.id);
}

function assertTeamMember(team, teamMemberId) {
  const member = team.members.find((m) => m.id === teamMemberId);
  if (!member) throw new Error("That user is not a member of your team");
  if (!member.isActive) throw new Error("That team member is deactivated");
  return member;
}

/** Manager explicitly assigns/reassigns a set of candidates to one team member. */
export function assignBulk({ candidateIds, teamMemberId, managerUser }) {
  const team = getTeamForManager(managerUser.id);
  if (!team) throw new Error("No team found for this manager");
  assertTeamMember(team, teamMemberId);
  if (!Array.isArray(candidateIds) || !candidateIds.length) {
    throw new Error("Select at least one candidate");
  }

  let count = 0;
  const run = db.transaction(() => {
    for (const id of candidateIds) {
      const candidate = getCandidate(id);
      if (!candidate) continue;
      setAssignment(candidate, teamMemberId, managerUser.id);
      count += 1;
    }
  });
  run();
  log(`${count} candidate(s) assigned to ${teamMemberId}`, { source: "ASSIGNMENT" });
  return { assigned: count };
}

/**
 * Round-robin distribution across the manager's active team members. Never
 * touches an already-assigned candidate unless `includeAssigned` is explicit
 * — matches spec §19 ("do not overwrite existing assignments automatically").
 */
export function autoDistribute({ candidateIds, managerUser, includeAssigned = false }) {
  const team = getTeamForManager(managerUser.id);
  if (!team) throw new Error("No team found for this manager");
  const memberIds = activeTeamMemberIds(team);
  if (!memberIds.length) throw new Error("Your team has no active members to assign to");

  let pool;
  if (Array.isArray(candidateIds) && candidateIds.length) {
    pool = candidateIds.map((id) => getCandidate(id)).filter(Boolean);
  } else {
    pool = db.prepare(`SELECT * FROM candidates`).all();
  }
  if (!includeAssigned) pool = pool.filter((c) => !c.assigned_to_user_id);
  if (!pool.length) return { distributed: 0, perMember: {} };

  const perMember = Object.fromEntries(memberIds.map((id) => [id, 0]));
  const run = db.transaction(() => {
    pool.forEach((candidate, index) => {
      const memberId = memberIds[index % memberIds.length];
      setAssignment(candidate, memberId, managerUser.id);
      perMember[memberId] += 1;
    });
  });
  run();
  log(`Auto-distributed ${pool.length} candidate(s) across ${memberIds.length} team member(s)`, {
    source: "ASSIGNMENT",
  });
  return { distributed: pool.length, perMember };
}

/**
 * Validates CSV rows (`candidate_id, assigned_to`) without writing anything.
 * `assigned_to` may be a username or a display name — matched case-insensitively
 * against the manager's own team.
 */
export function validateCsvAssignment(rows, managerUser) {
  const team = getTeamForManager(managerUser.id);
  if (!team) throw new Error("No team found for this manager");
  const byNameOrUsername = new Map();
  for (const m of team.members) {
    byNameOrUsername.set(m.username.toLowerCase(), m);
    byNameOrUsername.set(m.name.toLowerCase(), m);
  }

  const valid = [];
  const invalid = [];
  rows.forEach((row, index) => {
    const candidateRef = String(row.candidate_id ?? "").trim();
    const assignedToRef = String(row.assigned_to ?? "").trim();
    const reasons = [];

    if (!candidateRef) reasons.push("Missing candidate_id");
    if (!assignedToRef) reasons.push("Missing assigned_to");

    const candidate = candidateRef ? getCandidate(candidateRef) : null;
    if (candidateRef && !candidate) reasons.push(`Candidate "${candidateRef}" not found`);

    const member = assignedToRef ? byNameOrUsername.get(assignedToRef.toLowerCase()) : null;
    if (assignedToRef && !member) {
      reasons.push(`"${assignedToRef}" is not a member of your team`);
    } else if (member && !member.isActive) {
      reasons.push(`"${assignedToRef}" is deactivated`);
    }

    if (reasons.length) {
      invalid.push({ row: index + 1, candidate_id: candidateRef, assigned_to: assignedToRef, reasons });
    } else {
      valid.push({ candidateId: candidate.id, teamMemberId: member.id, row: index + 1 });
    }
  });

  return { total: rows.length, validCount: valid.length, invalidCount: invalid.length, valid, invalid };
}

export function applyCsvAssignment(validRows, managerUser) {
  let count = 0;
  const run = db.transaction(() => {
    for (const { candidateId, teamMemberId } of validRows) {
      const candidate = getCandidate(candidateId);
      if (!candidate) continue;
      setAssignment(candidate, teamMemberId, managerUser.id);
      count += 1;
    }
  });
  run();
  log(`CSV-assigned ${count} candidate(s)`, { source: "ASSIGNMENT" });
  return { assigned: count };
}
