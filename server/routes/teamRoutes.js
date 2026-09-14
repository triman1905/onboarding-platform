import { Router } from "express";
import { addTeamMember, getTeam, listTeams, setMemberActive } from "../services/teamService.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const teamRoutes = Router();

// Every route here is MANAGER-only, enforced on the backend — not just a hidden nav item.
teamRoutes.use(requireAuth);
teamRoutes.use(requireRole("MANAGER"));

teamRoutes.get("/", (_req, res) => {
  res.json(listTeams());
});

teamRoutes.get("/:id", (req, res) => {
  const team = getTeam(req.params.id);
  if (!team) return res.status(404).json({ message: "Team not found" });
  res.json(team);
});

teamRoutes.post("/:id/members", (req, res) => {
  try {
    res.json(addTeamMember(req.params.id, req.body ?? {}));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

teamRoutes.patch("/:id/members/:userId", (req, res) => {
  try {
    const { isActive } = req.body ?? {};
    res.json(setMemberActive(req.params.id, req.params.userId, Boolean(isActive)));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
