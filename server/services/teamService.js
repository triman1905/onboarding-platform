import { db, log, uid } from "../db/database.js";
import { hashPassword, getUserByUsername } from "./authService.js";

function memberRow(user) {
  const assignedCount =
    db
      .prepare(`SELECT COUNT(*) n FROM candidates WHERE assigned_to_user_id = ?`)
      .get(user.id)?.n ?? 0;
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    isActive: Boolean(user.is_active),
    assignedCandidates: assignedCount,
  };
}

export function getTeam(teamId) {
  const team = db.prepare(`SELECT * FROM teams WHERE id = ?`).get(teamId);
  if (!team) return null;
  const manager = db.prepare(`SELECT * FROM users WHERE id = ?`).get(team.manager_id);
  const members = db
    .prepare(`SELECT * FROM users WHERE team_id = ? AND role = 'TEAM_MEMBER' ORDER BY name ASC`)
    .all(teamId)
    .map(memberRow);
  return {
    id: team.id,
    name: team.name,
    managerId: team.manager_id,
    managerName: manager?.name ?? null,
    members,
  };
}

export function listTeams() {
  const rows = db.prepare(`SELECT id FROM teams`).all();
  return rows.map((r) => getTeam(r.id));
}

/** The team a given MANAGER user runs — this prototype seeds exactly one. */
export function getTeamForManager(managerUserId) {
  const team = db.prepare(`SELECT id FROM teams WHERE manager_id = ?`).get(managerUserId);
  return team ? getTeam(team.id) : null;
}

export function addTeamMember(teamId, { name, username, password, role = "TEAM_MEMBER" }) {
  const team = db.prepare(`SELECT id FROM teams WHERE id = ?`).get(teamId);
  if (!team) throw new Error("Team not found");
  if (!name || !String(name).trim()) throw new Error("Name is required");
  if (!username || !String(username).trim()) throw new Error("Username is required");
  if (getUserByUsername(username)) throw new Error("This username is already in use");

  const id = uid("user");
  const finalUsername = String(username).trim().toLowerCase();
  db.prepare(
    `INSERT INTO users (id, name, username, password_hash, role, team_id) VALUES (?,?,?,?,?,?)`,
  ).run(
    id,
    String(name).trim(),
    finalUsername,
    hashPassword(password || `${finalUsername}@123`),
    role === "MANAGER" ? "MANAGER" : "TEAM_MEMBER",
    teamId,
  );
  log(`Team member ${name} (${finalUsername}) added to team ${teamId}`, { source: "TEAM" });
  return getTeam(teamId);
}

export function setMemberActive(teamId, userId, isActive) {
  const user = db.prepare(`SELECT * FROM users WHERE id = ? AND team_id = ?`).get(userId, teamId);
  if (!user) throw new Error("Team member not found");
  if (user.role === "MANAGER") throw new Error("The manager cannot be deactivated");
  db.prepare(`UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?`).run(
    isActive ? 1 : 0,
    userId,
  );
  log(`Team member ${user.name} ${isActive ? "activated" : "deactivated"}`, { source: "TEAM" });
  return getTeam(teamId);
}
