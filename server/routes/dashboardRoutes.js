import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getDashboardSummary } from "../services/dashboardService.js";

export const dashboardRoutes = Router();
dashboardRoutes.use(requireAuth);

/**
 * Role-scoped exactly like `GET /api/candidates` — scoping happens inside
 * getDashboardSummary() using `req.user`, never a client-supplied override.
 */
dashboardRoutes.get("/summary", (req, res) => {
  res.json(getDashboardSummary(req.user, { batchId: req.query.batchId }));
});
