import { getUserBySessionToken, publicUser } from "../services/authService.js";
import { getCandidate } from "../services/batchService.js";

function extractToken(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

/** Requires a valid session token; attaches `req.user` (the raw DB row, incl. team_id/role). */
export function requireAuth(req, res, next) {
  const token = extractToken(req);
  const user = getUserBySessionToken(token);
  if (!user) return res.status(401).json({ message: "Authentication required" });
  req.user = user;
  next();
}

/** Requires `req.user.role` to be one of the given roles (applied after requireAuth). */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Authentication required" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to do this" });
    }
    next();
  };
}

/** True for a MANAGER, or a TEAM_MEMBER who owns this candidate. */
export function canAccessCandidate(candidate, user) {
  if (!candidate || !user) return false;
  if (user.role === "MANAGER") return true;
  return candidate.assigned_to_user_id === user.id;
}

/** Filters a candidate array down to what `user` may see (MANAGER = unchanged). */
export function filterCandidatesForUser(candidates, user) {
  if (!user || user.role === "MANAGER") return candidates;
  return candidates.filter((c) => c.assigned_to_user_id === user.id);
}

/**
 * Loads `req.params.id` as a candidate, 404s if missing, 403s a TEAM_MEMBER who
 * doesn't own it, otherwise attaches `req.candidate`. Use on every route that
 * reads or writes a single candidate's data (BGV, remarks, communication medium,
 * summary, communication history).
 */
export function requireCandidateAccess(req, res, next) {
  const candidate = getCandidate(req.params.id);
  if (!candidate) return res.status(404).json({ message: "Candidate not found" });
  if (!canAccessCandidate(candidate, req.user)) {
    return res.status(403).json({ message: "You do not have access to this candidate" });
  }
  req.candidate = candidate;
  next();
}

export { publicUser };
