import { Router } from "express";
import {
  createSession,
  getUserByUsername,
  invalidateSession,
  publicUser,
  updatePassword,
  verifyPassword,
} from "../services/authService.js";
import { requireAuth } from "../middleware/auth.js";

export const authRoutes = Router();

authRoutes.post("/login", (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }
  const user = getUserByUsername(username);
  if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ message: "Invalid username or password" });
  }
  const { token, expiresAt } = createSession(user.id);
  res.json({ token, expiresAt, user: publicUser(user) });
});

authRoutes.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

authRoutes.post("/logout", requireAuth, (req, res) => {
  const header = req.headers.authorization || "";
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1];
  invalidateSession(token);
  res.json({ ok: true });
});

/** Self-service password change — requires the current password, replaces the seeded one. */
authRoutes.post("/change-password", requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Current and new password are required" });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ message: "New password must be at least 6 characters" });
  }
  if (!verifyPassword(currentPassword, req.user.password_hash)) {
    return res.status(401).json({ message: "Current password is incorrect" });
  }
  updatePassword(req.user.id, newPassword);
  res.json({ ok: true });
});
