import crypto from "node:crypto";
import { db, uid } from "../db/database.js";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored ?? "").split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password ?? ""), salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(candidate, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function getUserByUsername(username) {
  return db
    .prepare(`SELECT * FROM users WHERE lower(username) = lower(?)`)
    .get(String(username ?? "").trim());
}

export function getUserById(id) {
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare(`INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?,?,?,?)`).run(
    uid("sess"),
    userId,
    token,
    expiresAt,
  );
  return { token, expiresAt };
}

export function getUserBySessionToken(token) {
  if (!token) return null;
  const session = db.prepare(`SELECT * FROM sessions WHERE token = ?`).get(token);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(session.id);
    return null;
  }
  const user = getUserById(session.user_id);
  if (!user || !user.is_active) return null;
  return user;
}

export function invalidateSession(token) {
  if (!token) return;
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

/** Overwrites the seeded/initial password. Callers must verify the current password first. */
export function updatePassword(userId, newPassword) {
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
    hashPassword(newPassword),
    userId,
  );
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    teamId: user.team_id,
    isActive: Boolean(user.is_active),
  };
}
