import express from "express";
import cors from "cors";
import { authRoutes } from "./routes/authRoutes.js";
import { teamRoutes } from "./routes/teamRoutes.js";
import { batchRoutes } from "./routes/batchRoutes.js";
import { candidateRoutes } from "./routes/candidateRoutes.js";
import { dashboardRoutes } from "./routes/dashboardRoutes.js";
import { emailRoutes } from "./routes/emailRoutes.js";
import { templateRoutes } from "./routes/templateRoutes.js";
import { reminderRoutes } from "./routes/reminderRoutes.js";
import { communicationRoutes } from "./routes/communicationRoutes.js";

/**
 * Builds the configured Express app WITHOUT calling listen() or initDb() —
 * the caller (server/index.js for the real server, server/test/*.test.js for
 * API tests) owns both of those. Extracted so tests can exercise the exact
 * same route wiring as production against an isolated SQLite file, instead
 * of mocking anything.
 */
export function createApp() {
  const app = express();

  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "5mb" }));
  // Twilio status callbacks POST application/x-www-form-urlencoded.
  app.use(express.urlencoded({ extended: true }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "abc-email-automation", time: new Date().toISOString() });
  });

  // Public: login itself. /me and /logout require a valid session internally.
  app.use("/api/auth", authRoutes);

  app.use("/api/teams", teamRoutes);
  app.use("/api/batches", batchRoutes);
  app.use("/api/candidates", candidateRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/email", emailRoutes);
  app.use("/api/templates", templateRoutes);
  app.use("/api/reminders", reminderRoutes);
  app.use("/api/communications", communicationRoutes);

  app.use((error, _req, res, _next) => {
    console.error("[api error]", error.message);
    res.status(500).json({ message: error.message || "Unexpected server error" });
  });

  return app;
}
